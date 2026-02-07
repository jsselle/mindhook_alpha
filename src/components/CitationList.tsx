import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Citation } from '../types/domain';
import { EvidencePill } from './EvidencePill';

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
