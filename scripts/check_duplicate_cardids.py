#!/usr/bin/env python3
"""
Script to check for duplicate cardIds in the cards export JSON file.
Analyzes all card types: tasks, bugs, epics, proposals, etc.
Reports duplicates and the highest cardId for database index update.
"""

import json
import sys
from collections import defaultdict

def extract_card_number(card_id):
    """Extract the numeric part from a cardId like 'EX2-0123' or 'EX2-BUG-0123'"""
    if not card_id:
        return None
    
    parts = str(card_id).split('-')
    # Try to find the numeric part (usually the last part)
    for part in reversed(parts):
        try:
            return int(part)
        except ValueError:
            continue
    return None

def check_duplicate_card_ids(input_file):
    """Check for duplicate cardIds across all card types"""
    
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
    
    # Track cardIds and their locations
    card_id_locations = defaultdict(list)
    card_numbers = []
    total_cards = 0
    cards_by_type = defaultdict(int)
    
    # Process all top-level keys (should be card types like BUGS, TASKS, EPICS, PROPOSALS, etc.)
    if isinstance(data, dict):
        for card_type, cards in data.items():
            if not isinstance(cards, dict):
                continue
            
            print(f"🔍 Checking {card_type}...")
            
            for card_key, card_value in cards.items():
                total_cards += 1
                cards_by_type[card_type] += 1
                
                if isinstance(card_value, dict):
                    card_id = card_value.get('cardId')
                    
                    if card_id:
                        # Track this cardId
                        card_id_locations[card_id].append({
                            'type': card_type,
                            'key': card_key
                        })
                        
                        # Extract numeric part for highest ID tracking
                        num = extract_card_number(card_id)
                        if num is not None:
                            card_numbers.append(num)
                    else:
                        print(f"  ⚠️  Missing cardId in {card_type}/{card_key}")
    
    # Report results
    print(f"\n{'='*60}")
    print(f"📊 SUMMARY")
    print(f"{'='*60}")
    print(f"Total cards analyzed: {total_cards}")
    print(f"\nCards by type:")
    for card_type, count in sorted(cards_by_type.items()):
        print(f"  {card_type}: {count}")
    
    # Check for duplicates
    duplicates = {cid: locs for cid, locs in card_id_locations.items() if len(locs) > 1}
    
    if duplicates:
        print(f"\n{'='*60}")
        print(f"❌ DUPLICATE CARD IDs FOUND: {len(duplicates)}")
        print(f"{'='*60}")
        
        for card_id, locations in sorted(duplicates.items()):
            print(f"\n🔴 CardId '{card_id}' appears {len(locations)} times:")
            for loc in locations:
                print(f"   - {loc['type']}/{loc['key']}")
    else:
        print(f"\n✅ No duplicate cardIds found!")
    
    # Report highest cardId
    if card_numbers:
        max_card_number = max(card_numbers)
        print(f"\n{'='*60}")
        print(f"📈 HIGHEST CARD ID NUMBER")
        print(f"{'='*60}")
        print(f"Current highest: {max_card_number}")
        print(f"Next available: {max_card_number + 1}")
        print(f"\n💡 Update the database index to at least: {max_card_number + 1}")
    else:
        print(f"\n⚠️  No valid card numbers found")
    
    print(f"\n{'='*60}\n")
    
    # Return exit code based on duplicates
    return 0 if not duplicates else 1

if __name__ == '__main__':
    input_file = 'data/sample-default-rtdb-cards-export 20250111.json'
    
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    
    exit_code = check_duplicate_card_ids(input_file)
    sys.exit(exit_code)
