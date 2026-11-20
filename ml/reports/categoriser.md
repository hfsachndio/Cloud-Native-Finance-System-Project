# Transaction categoriser – evaluation

Train: 7320 statement lines · Test: 1100 lines from **merchants never seen in training** · 4753 char n-gram features

| Model | 5-fold CV macro-F1 | Accuracy, new lines from known merchants | Accuracy, unseen merchants | Macro-F1, unseen merchants |
|---|---|---|---|---|
| logistic_regression | 0.9957 | 0.9945 | 0.6109 | 0.5992 |
| linear_svm | 0.9964 | 0.9954 | 0.59 | 0.5749 |
| naive_bayes | 0.9938 | 0.9936 | 0.6436 | 0.6293 |
| keyword_rules_baseline | – | 0.3907 | 0.3355 | 0.4306 |

Shipped: **logistic_regression** (calibrated probabilities let the app show confidence and fall back to *Uncategorised* below 40%).

| Category | Precision | Recall | F1 |
|---|---|---|---|
| Bills | 0.763 | 0.72 | 0.741 |
| Dining | 0.617 | 0.807 | 0.699 |
| Entertainment | 0.648 | 0.664 | 0.656 |
| Groceries | 0.678 | 0.647 | 0.662 |
| Health | 0.637 | 0.72 | 0.676 |
| Income | 0.58 | 0.4 | 0.473 |
| Shopping | 0.471 | 0.384 | 0.423 |
| Transfers | 0.492 | 0.62 | 0.549 |
| Transport | 0.562 | 0.472 | 0.513 |

Mean confidence when correct: 0.758 · when wrong: 0.398

Confusion matrix (rows = true, cols = predicted): Bills, Dining, Entertainment, Groceries, Health, Income, Shopping, Transfers, Transport

```
  90    0    0   13    1    1    0    3   17
   8  121    1    4    3    0   13    0    0
   0    2   83    8    1    1   15   12    3
   0   18    0   97   10    0   13    2   10
   1    8    1    0   72    0    5    0   13
   8    1    0    2    4   40    0   45    0
   7   25   18    5   20    1   48    1    0
   0    1    0    0    1   25    8   62    3
   4   20   25   14    1    1    0    1   59
```
