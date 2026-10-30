"""Retrieval-only comparison of vector, keyword and hybrid search. Uses no chat model.

For every answerable question it runs each search mode over the PDF and checks
whether a chunk from the right page is in the top 6, and how high the first one ranks.

    backend/.venv/Scripts/python evals/retrieval_eval.py --pdf Attention.pdf \
        --csv ground_truth.csv --csv evals/attention_exact_terms.csv --out evals/results/retrieval.csv

The PDF is indexed into a throwaway folder, so your file library is untouched.
The embedding model already downloaded into backend/data/models is reused.
"""

import argparse
import csv
import os
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODES = ("vector", "keyword", "hybrid")

parser = argparse.ArgumentParser()
parser.add_argument("--pdf", required=True)
parser.add_argument("--csv", action="append", required=True, help="Questions; may be given more than once.")
parser.add_argument("--out", default="evals/results/retrieval.csv")
parser.add_argument("--k", type=int, default=6)
args = parser.parse_args()

os.environ["WORLDBEE_DATA_DIR"] = tempfile.mkdtemp(prefix="worldbee-eval-")
sys.path.insert(0, str(ROOT / "backend"))
from fastembed import TextEmbedding  # noqa: E402

from app import documents  # noqa: E402

documents._embedder = TextEmbedding(documents.EMBEDDING_MODEL, cache_dir=str(ROOT / "backend/data/models"))

pdf = Path(args.pdf)
record = documents.add_document(pdf.name, pdf.read_bytes())
print(f"Indexed {pdf.name}: {record['chunks']} chunks over {record['pages']} pages\n")

questions = []
for path in args.csv:
    with open(path, encoding="utf-8") as f:
        questions += [q for q in csv.DictReader(f) if q["source_page"].strip()]

rows = []
for q in questions:
    truth = int(q["source_page"])
    row = {"id": q["id"], "type": q["question_type"], "question": q["question"], "truth_page": truth}
    for mode in MODES:
        pages = [hit["page"] for hit in documents.search(q["question"], [record["id"]], k=args.k, mode=mode)]
        rank = pages.index(truth) + 1 if truth in pages else None
        row[f"{mode}_pages"] = " ".join(str(p) for p in pages)
        row[f"{mode}_rank"] = rank or ""
    rows.append(row)


def summary(subset: list[dict]) -> str:
    parts = []
    for mode in MODES:
        ranks = [r[f"{mode}_rank"] for r in subset]
        hits = sum(1 for rank in ranks if rank)
        mrr = sum(1 / rank for rank in ranks if rank) / len(subset)
        parts.append(f"{mode} {hits}/{len(subset)} hit, MRR {mrr:.3f}")
    return " | ".join(parts)


groups = defaultdict(list)
for row in rows:
    groups[row["type"]].append(row)
print(f"{'all':<10} ({len(rows)}) {summary(rows)}")
for kind, subset in sorted(groups.items()):
    print(f"{kind:<10} ({len(subset)}) {summary(subset)}")

print("\nQuestions where the modes disagree (rank of the right page, - = missed):")
for row in rows:
    ranks = [row[f"{mode}_rank"] or "-" for mode in MODES]
    if len(set(ranks)) > 1:
        print(f"  {row['id']:>4} vector {ranks[0]}, keyword {ranks[1]}, hybrid {ranks[2]}  {row['question'][:70]}")

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
with out.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print(f"\nWrote {out}")
