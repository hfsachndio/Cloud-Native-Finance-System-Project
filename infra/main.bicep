// FinTrack infrastructure: App Service (gateway + 3 microservices), Azure Functions,
// Cosmos DB (serverless), Blob Storage and Application Insights.
// Deploy:  az deployment group create -g <rg> -f infra/main.bicep -p prefix=fintrack
targetScope = 'resourceGroup'

@description('Short name used as a prefix for every resource.')
param prefix string = 'fintrack'
param location string = resourceGroup().location
@allowed(['B1', 'S1', 'P0v3'])
param appServiceSku string = 'B1'

var unique = uniqueString(resourceGroup().id)
var services = ['gateway', 'accounts', 'transactions', 'budgets']

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs-${unique}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-ai-${unique}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

// ---------- Cosmos DB (serverless, partitioned by /userId) ----------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${prefix}-cosmos-${unique}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [{ locationName: location, failoverPriority: 0 }]
    capabilities: [{ name: 'EnableServerless' }]
    disableLocalAuth: true
  }
}

resource db 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'fintrack'
  properties: { resource: { id: 'fintrack' } }
}

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for c in ['accounts', 'transactions', 'budgets', 'alerts']: {
  parent: db
  name: c
  properties: { resource: { id: c, partitionKey: { paths: ['/userId'], kind: 'Hash' } } }
}]

resource leases 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: db
  name: 'leases'
  properties: { resource: { id: 'leases', partitionKey: { paths: ['/id'], kind: 'Hash' } } }
}

// ---------- Storage (receipts + Functions runtime) ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${replace(prefix, '-', '')}st${unique}', 24)
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2', supportsHttpsTrafficOnly: true }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource receipts 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'receipts'
  properties: { publicAccess: 'None' }
}

// ---------- App Service: gateway + microservices ----------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-plan-${unique}'
  location: location
  sku: { name: appServiceSku }
  kind: 'linux'
  properties: { reserved: true }
}

resource apps 'Microsoft.Web/sites@2023-12-01' = [for s in services: {
  name: '${prefix}-${s}-${unique}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      healthCheckPath: '/health'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'Storage__Provider', value: 'Azure' }
        { name: 'Storage__BlobEndpoint', value: storage.properties.primaryEndpoints.blob }
        { name: 'Cosmos__Endpoint', value: cosmos.properties.documentEndpoint }
        { name: 'Cosmos__Database', value: 'fintrack' }
        { name: 'Services__Accounts', value: 'https://${prefix}-accounts-${unique}.azurewebsites.net' }
        { name: 'Services__Transactions', value: 'https://${prefix}-transactions-${unique}.azurewebsites.net' }
        { name: 'Services__Budgets', value: 'https://${prefix}-budgets-${unique}.azurewebsites.net' }
      ]
    }
  }
}]

// ---------- Azure Functions (consumption plan) ----------
resource funcPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-func-plan-${unique}'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  kind: 'functionapp'
  properties: { reserved: true }
}

resource functions 'Microsoft.Web/sites@2023-12-01' = {
  name: '${prefix}-func-${unique}'
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: funcPlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNET-ISOLATED|8.0'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'dotnet-isolated' }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'Storage__blobServiceUri', value: storage.properties.primaryEndpoints.blob }
        { name: 'Storage__BlobEndpoint', value: storage.properties.primaryEndpoints.blob }
        { name: 'Cosmos__accountEndpoint', value: cosmos.properties.documentEndpoint }
        { name: 'Cosmos__Endpoint', value: cosmos.properties.documentEndpoint }
        { name: 'Cosmos__Database', value: 'fintrack' }
      ]
    }
  }
}

// ---------- Managed identity access (no secrets anywhere) ----------
var blobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageAccountContributor = '17d1049b-9a84-46fb-8f53-869881c3d3ab'
var cosmosDataContributor = '00000000-0000-0000-0000-000000000002'

resource appBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (s, i) in services: {
  name: guid(storage.id, apps[i].id, blobDataContributor)
  scope: storage
  properties: { principalId: apps[i].identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor) }
}]

resource funcBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in [blobDataContributor, storageAccountContributor]: {
  name: guid(storage.id, functions.id, role)
  scope: storage
  properties: { principalId: functions.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role) }
}]

resource appCosmosAccess 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = [for (s, i) in services: {
  parent: cosmos
  name: guid(cosmos.id, apps[i].id, cosmosDataContributor)
  properties: { principalId: apps[i].identity.principalId, roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}', scope: cosmos.id }
}]

resource funcCosmosAccess 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, functions.id, cosmosDataContributor)
  properties: { principalId: functions.identity.principalId, roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributor}', scope: cosmos.id }
}

output gatewayUrl string = 'https://${apps[0].properties.defaultHostName}'
output functionApp string = functions.name
output appNames array = [for (s, i) in services: apps[i].name]
