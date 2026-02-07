# Epic 7: Retrieval & Memory System

| Field | Value |
|-------|-------|
| **Epic** | 7 |
| **Name** | Retrieval & Memory System |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.5, 5, 6 |
| **Predecessors** | Design system, tool bridge, ingestion pipeline |

---

## Overview

Implement the retrieval flow where Gemini searches stored data to answer user questions, including citation rendering and evidence pills in the UI.

---

## Retrieval Flow Algorithm

```
ON user query about stored information:

1. Call search_memory with relevant subject/type
   - Order by confidence DESC, created_at DESC
   
2. IF memory results insufficient:
   Call search_attachments with relevant entities
   - Joins entity_index to find attachments
   - Order by weight DESC, created_at DESC

3. FOR promising attachments:
   Call get_attachment_bundle to get full metadata
   - Especially transcript/scene for context

4. Compose answer using gathered evidence

5. Include citations in response:
   - Reference memory_item_id for memory facts
   - Reference attachment_id + metadata_kind for media evidence
```

---

## Citation Data Structure

```typescript
interface Citation {
  kind: 'attachment' | 'message' | 'memory';
  attachment_id?: string;
  message_id?: string;
  memory_item_id?: string;
  metadata_kind?: MetadataKind;  // transcript, scene, etc.
  note?: string;                  // Human-readable note
}
```

---

## Evidence Pill Component

**File: `src/components/EvidencePill.tsx`**

```typescript
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme/tokens';

interface EvidencePillProps {
  kind: 'attachment' | 'message' | 'memory';
  label: string;
  metadataKind?: string;
  onPress: () => void;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  attachment: 'attach-outline',
  message: 'chatbubble-outline',
  memory: 'bulb-outline',
  transcript: 'document-text-outline',
  scene: 'image-outline',
};

export const EvidencePill: React.FC<EvidencePillProps> = ({
  kind,
  label,
  metadataKind,
  onPress,
}) => {
  const iconName = metadataKind ? ICONS[metadataKind] : ICONS[kind];

  return (
    <TouchableOpacity style={styles.pill} onPress={onPress}>
      <Ionicons name={iconName || 'document-outline'} size={14} color={colors.accent.primary} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay.medium,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    marginRight: spacing.xs,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: colors.accent.primary,
    marginLeft: spacing.xs,
  },
});
```

---

## Citation Renderer Component

**File: `src/components/CitationList.tsx`**

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EvidencePill } from './EvidencePill';

interface Citation {
  kind: 'attachment' | 'message' | 'memory';
  attachment_id?: string;
  message_id?: string;
  memory_item_id?: string;
  metadata_kind?: string;
  note?: string;
}

interface CitationListProps {
  citations: Citation[];
  onCitationPress: (citation: Citation) => void;
}

export const CitationList: React.FC<CitationListProps> = ({
  citations,
  onCitationPress,
}) => {
  if (citations.length === 0) return null;

  const getLabel = (c: Citation): string => {
    if (c.note) return c.note;
    if (c.metadata_kind === 'transcript') return 'Voice Note';
    if (c.metadata_kind === 'scene') return 'Photo';
    if (c.kind === 'memory') return 'Memory';
    return 'Source';
  };

  return (
    <View style={styles.container}>
      {citations.map((c, i) => (
        <EvidencePill
          key={`${c.kind}-${c.attachment_id || c.message_id || c.memory_item_id}-${i}`}
          kind={c.kind}
          label={getLabel(c)}
          metadataKind={c.metadata_kind}
          onPress={() => onCitationPress(c)}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
});
```

---

## Backend Retrieval Prompt

Add to `backend_server/src/gemini/systemPrompt.ts`:

```typescript
export const RETRIEVAL_PROMPT_SECTION = `
## Retrieval Rules

When user asks about stored information (locations, history, prior notes):

1. ALWAYS call search_memory first with relevant subject
   - For "where is X?" → subject="X", type="object_location"
   - For "when did I..." → type="event", recent_days=30
   - For habits → type="habit"

2. If search_memory returns no results or low confidence:
   Call search_attachments with related entities
   - For "keys" → entities=["keys", "wallet"] (related items)
   
3. For top attachment results, call get_attachment_bundle
   to retrieve transcript/scene for full context

4. Formulate answer citing evidence:
   - "Based on your voice note from [date], your keys are..."
   - "I found a photo showing..."
   
5. Always include citations in your response for traceability
`;
```

---

## Example Retrieval Sequence

User: "Where are my keys?"

```json
// 1. Search memory
{
  "name": "search_memory",
  "args": {
    "subject": "keys",
    "type": "object_location",
    "limit": 5,
    "schema_version": "1"
  }
}

// Result: [{ subject: "keys", predicate: "last_seen", object: "kitchen counter", confidence: 0.9, source_attachment_id: "att-1" }]

// 2. Get attachment bundle for source
{
  "name": "get_attachment_bundle",
  "args": {
    "attachment_id": "att-1",
    "schema_version": "1"
  }
}

// Result: { attachment: {...}, metadata: [{ kind: "transcript", payload: { text: "I left my keys..." } }] }
```

Response: "Based on your voice note from earlier today, you left your keys on the kitchen counter near the coffee maker."

Citations: `[{ kind: "attachment", attachment_id: "att-1", metadata_kind: "transcript", note: "Voice note" }]`

---

## Test Specifications

**File: `src/components/__tests__/CitationList.test.tsx`**

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { CitationList } from '../CitationList';

describe('CitationList', () => {
  const mockCitations = [
    { kind: 'attachment' as const, attachment_id: 'a1', metadata_kind: 'transcript', note: 'Voice Note' },
    { kind: 'memory' as const, memory_item_id: 'm1' },
  ];

  it('renders pills for each citation', () => {
    render(<CitationList citations={mockCitations} onCitationPress={jest.fn()} />);
    
    expect(screen.getByText('Voice Note')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
  });

  it('calls onCitationPress with citation', () => {
    const onPress = jest.fn();
    render(<CitationList citations={mockCitations} onCitationPress={onPress} />);
    
    fireEvent.press(screen.getByText('Voice Note'));
    expect(onPress).toHaveBeenCalledWith(mockCitations[0]);
  });
});
```

---

## Acceptance Criteria

- [ ] search_memory called for relevant queries
- [ ] search_attachments used as fallback
- [ ] get_attachment_bundle retrieves full context
- [ ] EvidencePill renders with correct icon
- [ ] CitationList renders all citations
- [ ] Pill press triggers navigation/modal
- [ ] All tests pass

---

## Report Template

Create `reports/epic_7_report.md` after completion.
