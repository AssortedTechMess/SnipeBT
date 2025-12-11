import json

print("Loading checkpoint...")
with open('trainingData_checkpoint.json', 'r') as f:
    checkpoint = json.load(f)

print("Loading full...")
with open('trainingData_full.json', 'r') as f:
    full = json.load(f)

print(f"Checkpoint: {len(checkpoint['examples'])} examples")
print(f"Full: {len(full['examples'])} examples")

merged = {
    'examples': checkpoint['examples'] + full['examples'],
    'metadata': {
        'total_examples': len(checkpoint['examples']) + len(full['examples']),
        'source': 'merged from checkpoint and full'
    }
}

print(f"Writing merged file with {len(merged['examples'])} examples...")
with open('trainingData_merged.json', 'w') as f:
    json.dump(merged, f)

print(f"✅ Merged {len(merged['examples'])} examples into trainingData_merged.json")
