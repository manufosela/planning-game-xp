#!/usr/bin/env python3
"""
Script to clean JSON file:
1. Remove duplicate IDs in keys
2. Remove duplicate cardIds 
3. Unify all IDs to start with "EX2-" format
4. Remove obsolete keys, keeping only allowed fields
"""

import json
import sys
from collections import OrderedDict

# Allowed keys for each object
ALLOWED_KEYS = {
    "bugType",
    "cardId",
    "cardType",
    "cinemaFile",
    "createdBy",
    "description",
    "endDate",
    "exportedFile",
    "firebaseId",
    "group",
    "id",
    "importedFile",
    "isYearReadOnly",
    "notes",
    "plugin",
    "pluginVersion",
    "priority",
    "projectId",
    "registerDate",
    "startDate",
    "status",
    "title",
    "treatmentType",
    "year"
}

def clean_json_ids(input_file, output_file):
    """Clean JSON IDs: remove duplicates and unify prefix to EX2-"""
    
    # Read the JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Track used IDs
    used_ids = set()
    id_mapping = {}
    next_number = 1
    
    # First pass: create unified ID mapping for each object
    # Priority: try to extract number from cardId first, then from key
    if isinstance(data, dict):
        for original_key, value in data.items():
            new_id = None
            
            # Try to extract number from cardId first (higher priority)
            if isinstance(value, dict) and 'cardId' in value:
                original_card_id = value['cardId']
                if '-' in original_card_id:
                    parts = original_card_id.split('-')
                    # Try to find the numeric part
                    for part in reversed(parts):
                        try:
                            num = int(part)
                            new_id = f"EX2-{num:04d}"
                            break
                        except ValueError:
                            continue
            
            # If no cardId or couldn't extract number, try from the key
            if new_id is None:
                if original_key.startswith('EX2-'):
                    try:
                        num = int(original_key.split('-')[1])
                        new_id = f"EX2-{num:04d}"
                    except (IndexError, ValueError):
                        pass
                else:
                    parts = original_key.split('-')
                    if len(parts) >= 2:
                        try:
                            num = int(parts[1])
                            new_id = f"EX2-{num:04d}"
                        except ValueError:
                            pass
            
            # If still no ID, assign sequential
            if new_id is None:
                new_id = f"EX2-{next_number:04d}"
                next_number += 1
            
            # If ID already used, assign a new sequential one
            while new_id in used_ids:
                new_id = f"EX2-{next_number:04d}"
                next_number += 1
            
            used_ids.add(new_id)
            id_mapping[original_key] = new_id
    
    # Second pass: create new data structure with unified IDs and filtered keys
    cleaned_data = OrderedDict()
    removed_keys_count = {}
    
    if isinstance(data, dict):
        for original_key, value in data.items():
            unified_id = id_mapping[original_key]
            
            # Filter object to keep only allowed keys
            if isinstance(value, dict):
                filtered_value = OrderedDict()
                
                # Track removed keys for reporting
                for key in value.keys():
                    if key not in ALLOWED_KEYS:
                        removed_keys_count[key] = removed_keys_count.get(key, 0) + 1
                
                # Keep only allowed keys
                for key in ALLOWED_KEYS:
                    if key in value:
                        filtered_value[key] = value[key]
                
                # Set unified ID for all three fields: key, id, and cardId
                filtered_value['id'] = unified_id
                if 'cardId' in value:  # Only set if cardId existed
                    filtered_value['cardId'] = unified_id
                
                cleaned_data[unified_id] = filtered_value
            else:
                cleaned_data[unified_id] = value
    
    # Write the cleaned data
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Cleaned JSON saved to: {output_file}")
    print(f"📊 Total items: {len(cleaned_data)}")
    print(f"🔑 IDs unified: {len(used_ids)}")
    print(f"🔄 Items changed: {sum(1 for k, v in id_mapping.items() if k != v)}")
    
    # Report removed keys
    if removed_keys_count:
        print(f"\n🗑️  Removed obsolete keys:")
        for key, count in sorted(removed_keys_count.items(), key=lambda x: x[1], reverse=True):
            print(f"  {key}: {count} occurrences")
    else:
        print(f"\n✨ No obsolete keys found")
    
    # Show some examples of ID changes
    print(f"\nSample ID Mapping (first 15 changes):")
    count = 0
    for old_id, new_id in id_mapping.items():
        if old_id != new_id and count < 15:
            print(f"  {old_id} → {new_id}")
            count += 1

if __name__ == '__main__':
    input_file = 'data/sample-tests-rtdb-BUGS_Extranet V2-export.json'
    output_file = 'data/sample-tests-rtdb-BUGS_Extranet V2-export.cleaned.json'
    
    clean_json_ids(input_file, output_file)
