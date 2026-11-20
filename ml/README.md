# FinTrack ML

Everything needed to rebuild FinTrack's AI from scratch: data, training, evaluation and the exported model.

| Step | Command | Output |
|---|---|---|
| 1. Build the dataset | `python generate_data.py` | `data/train.csv` (7,320 rows), `data/test.csv` (1,100 rows from unseen merchants), `data/test_known_merchants.csv` |
| 2. Train + evaluate | `python train_categoriser.py` | `../web/api/_lib/models/categoriser.json`, `reports/categoriser.md`, `reports/parity.json` |
| 3. Test the exported model | `cd ../web && npm test` (Node) · `dotnet test tests/FinTrack.Tests` (.NET) | JS and C# reproduce scikit-learn's predictions to 0.002 |

CI (`.github/workflows/ci.yml`) retrains on every push and fails the build if accuracy drops below 97% (known merchants) or 55% (unseen merchants).

## Model card: transaction categoriser

- **Task:** map a raw bank-statement line (e.g. `POS IMTIAZ SUPERMARKET KHI REF 88213`) to one of 9 categories: Bills, Dining, Entertainment, Groceries, Health, Income, Shopping, Transfers, Transport.
- **Data:** 200+ real Pakistani and international merchants, rendered the way banks print them: card prefixes, reference numbers, city names, card-network category text, upper/lower case, truncation and typos. ~20% of merchants per category are held out, so the test set measures generalisation to merchants the model has never seen.
- **Features:** TF-IDF over character 2–5-grams inside word boundaries (sublinear tf, digits stripped). Fragments such as `pharm`, `mart`, `fuel`, `bill` carry over to new merchants.
- **Model:** multinomial logistic regression (C = 8). Compared against a linear SVM, multinomial Naive Bayes and the old keyword rules (table below). Logistic regression was shipped because its calibrated probabilities drive the confidence shown in the app and the *Uncategorised* fallback below 40%.
- **Inference:** the weights are exported to JSON and run in plain JavaScript (Vercel API) and C# (`FinTrack.Shared`). No Python or paid AI service is needed at runtime.
- **Personalisation:** when a user changes a category, FinTrack stores *merchant → category* for that user and uses it ahead of the model for later payments.
- **Limits:** short brand names with no descriptive text (e.g. a bare `KFC`) are the hardest case; the app shows the confidence so low-confidence guesses are easy to spot and correct.

## Spending forecast

- **Method:** Holt's linear trend (double exponential smoothing) per category on the last 6 months. α and β are grid-searched per series by minimising one-step-ahead absolute error on the user's own history.
- **This month:** the projection blends the current daily pace with the forecast, weighting the pace more as the month goes on.
- **Evaluation:** the Insights page shows the forecast's MAE next to the naive "same as last month" error, so you can see whether the model beats the baseline on your data.
- **Unusual payments:** a robust z-score (median and MAD) per category flags payments far above your typical amount.

## Results
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
