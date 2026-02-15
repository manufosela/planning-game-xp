#!/usr/bin/env python3
"""
Script to fix duplicate cardIds in the cards export JSON file.
Structure: Project -> Card Type Group -> Individual Cards
CardId format: [3_letra_proyecto]-[3_letras_grupo]-NNNN

The script:
1. Detects duplicate cardIds within each project-group
2. Reassigns duplicates using free IDs when possible
3. Reports if it was necessary to increase the maximum ID
"""

import json
import sys
from collections import defaultdict
from typing import Dict, Set, List, Tuple

def extract_card_info(card_id: str) -> Tuple[str, str, int]:
    """
    Extract project prefix, group prefix, and number from cardId
    Example: 'EX2-BUG-0123' -> ('EX2', 'BUG', 123)
    """
    if not card_id:
        return None, None, None
    
    parts = str(card_id).split('-')
    if len(parts) >= 3:
        try:
            project_prefix = parts[0]
            group_prefix = parts[1]
            number = int(parts[2])
            return project_prefix, group_prefix, number
        except (ValueError, IndexError):
            pass
    
    return None, None, None

def build_card_id(project_prefix: str, group_prefix: str, number: int) -> str:
    """Build a cardId from components"""
    return f"{project_prefix}-{group_prefix}-{number:04d}"

def fix_duplicate_card_ids(input_file: str, output_file: str):
    """Fix duplicate cardIds in the JSON file"""
    
    print(f"📂 Reading file: {input_file}\n")
    
    # Read the JSON file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File not found: {input_file}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in file: {e}")
        sys.exit(1)
    
    # Track statistics
    total_cards = 0
    total_duplicates_fixed = 0
    groups_with_duplicates = []
    max_ids_increased = []
    
    # Process each project
    if not isinstance(data, dict):
        print("❌ Error: Expected top-level object to be a dictionary")
        sys.exit(1)
    
    for project_name, project_data in data.items():
        if not isinstance(project_data, dict):
            continue
        
        print(f"🔍 Processing project: {project_name}")
        
        # Process each card type group within the project
        for group_key, group_data in project_data.items():
            if not isinstance(group_data, dict):
                continue
            
            # Skip if it's not a cards group (should start with BUGS_, EPICS_, etc.)
            if not any(group_key.startswith(prefix) for prefix in ['BUGS_', 'EPICS_', 'PROPOSALS_', 'QA_', 'SPRINTS_', 'TASKS_', 'TICKETS_']):
                continue
            
            # Collect all cards in this group
            cards = []
            card_ids_seen = {}  # cardId -> list of card keys
            
            for card_key, card_value in group_data.items():
                if isinstance(card_value, dict):
                    total_cards += 1
                    card_id = card_value.get('cardId')
                    
                    if card_id:
                        cards.append({
                            'key': card_key,
                            'data': card_value,
                            'cardId': card_id
                        })
                        
                        if card_id not in card_ids_seen:
                            card_ids_seen[card_id] = []
                        card_ids_seen[card_id].append(card_key)
            
            # Find duplicates in this group
            duplicates = {cid: keys for cid, keys in card_ids_seen.items() if len(keys) > 1}
            
            if not duplicates:
                print(f"  ✅ {group_key}: No duplicates ({len(cards)} cards)")
                continue
            
            print(f"  ⚠️  {group_key}: Found {len(duplicates)} duplicate cardIds")
            groups_with_duplicates.append(f"{project_name}/{group_key}")
            
            # Extract prefix information from existing cards
            project_prefix = None
            group_prefix = None
            used_numbers = set()
            
            for card in cards:
                proj_p, grp_p, num = extract_card_info(card['cardId'])
                if proj_p and grp_p and num is not None:
                    if not project_prefix:
                        project_prefix = proj_p
                    if not group_prefix:
                        group_prefix = grp_p
                    used_numbers.add(num)
            
            if not project_prefix or not group_prefix:
                print(f"    ❌ Could not determine prefix format for {group_key}")
                continue
            
            # Find the current maximum number
            max_number = max(used_numbers) if used_numbers else 0
            original_max = max_number
            
            # Fix duplicates
            for dup_card_id, dup_keys in duplicates.items():
                # Keep the first occurrence, fix the rest
                for i, card_key in enumerate(dup_keys[1:], 1):
                    # Try to find a free number
                    new_number = None
                    for num in range(1, max_number + 1):
                        if num not in used_numbers:
                            new_number = num
                            break
                    
                    # If no free number, increase max
                    if new_number is None:
                        max_number += 1
                        new_number = max_number
                    
                    # Build new cardId
                    new_card_id = build_card_id(project_prefix, group_prefix, new_number)
                    
                    # Update the card
                    group_data[card_key]['cardId'] = new_card_id
                    used_numbers.add(new_number)
                    
                    print(f"    🔄 {card_key}: {dup_card_id} → {new_card_id}")
                    total_duplicates_fixed += 1
            
            # Report if max was increased
            if max_number > original_max:
                max_ids_increased.append({
                    'group': f"{project_name}/{group_key}",
                    'prefix': f"{project_prefix}-{group_prefix}",
                    'old_max': original_max,
                    'new_max': max_number
                })
    
    # Write the fixed data
    print(f"\n💾 Writing fixed data to: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Final report
    print(f"\n{'='*60}")
    print(f"📊 FINAL REPORT")
    print(f"{'='*60}")
    print(f"Total cards analyzed: {total_cards}")
    print(f"Duplicate cardIds fixed: {total_duplicates_fixed}")
    print(f"Groups with duplicates: {len(groups_with_duplicates)}")
    
    if groups_with_duplicates:
        print(f"\nGroups that had duplicates:")
        for group in groups_with_duplicates:
            print(f"  - {group}")
    
    if max_ids_increased:
        print(f"\n{'='*60}")
        print(f"⚠️  MAXIMUM IDs INCREASED")
        print(f"{'='*60}")
        print(f"The following groups needed to increase their maximum ID:\n")
        for info in max_ids_increased:
            print(f"  📈 {info['group']}")
            print(f"     Prefix: {info['prefix']}")
            print(f"     Old max: {info['old_max']}")
            print(f"     New max: {info['new_max']}")
            print(f"     Last ID added: {info['prefix']}-{info['new_max']:04d}\n")
    else:
        print(f"\n✅ No maximum IDs needed to be increased (all duplicates fixed with free IDs)")
    
    print(f"{'='*60}\n")
    
    return 0 if total_duplicates_fixed == 0 else 1

if __name__ == '__main__':
    input_file = 'data/sample-default-rtdb-cards-export 20250111.json'
    output_file = 'data/sample-default-rtdb-cards-export 20250111.fixed.json'
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    
    exit_code = fix_duplicate_card_ids(input_file, output_file)
    sys.exit(exit_code)