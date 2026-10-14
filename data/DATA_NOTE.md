# Data note

The pipeline calibrates on the Prudential Life Insurance Assessment corpus
(Kaggle, 59,381 applicant records, 128 columns).

Because the raw file is 20 MB, it is not committed. Download it once:

    curl -sL -o data/train.csv \
      https://raw.githubusercontent.com/ningningliu/Prudential-Life-Insurance-Assessment/master/data/train.csv

Then regenerate every frontend artifact deterministically:

    PYTHONPATH=. python scripts/build_outputs.py

Column semantics: only Ins_Age, Ht, Wt, BMI are documented continuous fields.
All other groups are anonymized; the pipeline treats them as answered-field
counts and never invents meanings for them.
