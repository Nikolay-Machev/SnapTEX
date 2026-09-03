# Fine-tuning data

Create `train.jsonl` and `validation.jsonl` here. Each line contains a path relative to its manifest and the exact target LaTeX:

```json
{"image":"images/example.jpeg","latex":"\\frac{a}{b}"}
```

Do not train on the ten evaluation fixtures. Keeping evaluation images separate prevents leakage and makes the reported character error rate meaningful. Start with several hundred manually verified examples; add failed real-world inputs only with the uploader's permission and after removing metadata.
