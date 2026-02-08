import React, { useEffect, useMemo, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { Role } from '../types/domain';

interface MessageBubbleProps {
    id: string;
    role: Role;
    text: string | null;
    isActivity?: boolean;
    children?: React.ReactNode; // For attachment previews
}

type InlineSegment = {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
};

const renderInline = (line: string, keyPrefix: string) => {
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
    const parts = line.split(regex).filter(Boolean);

    return parts.map((part, index) => {
        const key = `${keyPrefix}-${index}`;
        const segment: InlineSegment = { text: part };

        if (part.startsWith('**') && part.endsWith('**')) {
            segment.text = part.slice(2, -2);
            segment.bold = true;
        } else if (part.startsWith('*') && part.endsWith('*')) {
            segment.text = part.slice(1, -1);
            segment.italic = true;
        } else if (part.startsWith('`') && part.endsWith('`')) {
            segment.text = part.slice(1, -1);
            segment.code = true;
        }

        return (
            <Text
                key={key}
                style={[
                    segment.bold && styles.mdBold,
                    segment.italic && styles.mdItalic,
                    segment.code && styles.mdCode,
                ]}
            >
                {segment.text}
            </Text>
        );
    });
};

const MarkdownText: React.FC<{ text: string; style?: StyleProp<TextStyle> }> = ({ text, style }) => {
    const lines = text.split('\n');

    return (
        <View style={styles.mdContainer}>
            {lines.map((rawLine, index) => {
                const line = rawLine.trimEnd();

                if (line.length === 0) {
                    return <View key={`gap-${index}`} style={styles.mdGap} />;
                }

                const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const headingText = headingMatch[2];
                    return (
                        <Text
                            key={`h-${index}`}
                            style={[
                                style,
                                styles.mdLine,
                                styles.mdBold,
                                level <= 2 && styles.mdHeadingLarge,
                                level >= 3 && styles.mdHeadingSmall,
                            ]}
                        >
                            {renderInline(headingText, `h-inline-${index}`)}
                        </Text>
                    );
                }

                const bulletMatch = line.match(/^[-*]\s+(.*)$/);
                if (bulletMatch) {
                    return (
                        <Text key={`b-${index}`} style={[style, styles.mdLine, styles.mdListLine]}>
                            <Text style={styles.mdBullet}>{'\u2022 '}</Text>
                            {renderInline(bulletMatch[1], `b-inline-${index}`)}
                        </Text>
                    );
                }

                const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
                if (numberedMatch) {
                    return (
                        <Text key={`n-${index}`} style={[style, styles.mdLine, styles.mdListLine]}>
                            <Text style={styles.mdBullet}>{numberedMatch[1]}. </Text>
                            {renderInline(numberedMatch[2], `n-inline-${index}`)}
                        </Text>
                    );
                }

                return (
                    <Text key={`p-${index}`} style={[style, styles.mdLine]}>
                        {renderInline(line, `p-inline-${index}`)}
                    </Text>
                );
            })}
        </View>
    );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    role,
    text,
    isActivity = false,
    children,
}) => {
    const isUser = role === 'user';
    const isSystem = role === 'system';
    const shouldRenderMarkdown = !isUser && !isActivity;
    const [ellipsisStep, setEllipsisStep] = useState(0);

    useEffect(() => {
        if (!isActivity || !text) {
            return;
        }

        const id = setInterval(() => {
            setEllipsisStep((prev) => (prev + 1) % 4);
        }, 420);

        return () => clearInterval(id);
    }, [isActivity, text]);

    const activityText = useMemo(() => {
        if (!isActivity || !text) {
            return text;
        }

        const base = text.replace(/\.+$/, '');
        return base;
    }, [isActivity, text]);

    return (
        <View style={[
            styles.container,
            isUser && styles.userContainer,
            isSystem && styles.systemContainer,
        ]}>
            <View style={[
                styles.bubble,
                isUser && styles.userBubble,
                isSystem && styles.systemBubble,
                isActivity && styles.activityBubble,
            ]}>
                {activityText && (
                    shouldRenderMarkdown
                        ? <MarkdownText text={activityText} style={[styles.text, isUser && styles.userText]} />
                        : (
                            isActivity ? (
                                <View style={styles.activityTextRow}>
                                    <Text style={[styles.text, styles.activityText]}>{activityText}</Text>
                                    <View style={styles.activityDotsRow}>
                                        <Text style={[styles.text, styles.activityText, ellipsisStep >= 1 ? styles.dotVisible : styles.dotHidden]}>.</Text>
                                        <Text style={[styles.text, styles.activityText, ellipsisStep >= 2 ? styles.dotVisible : styles.dotHidden]}>.</Text>
                                        <Text style={[styles.text, styles.activityText, ellipsisStep >= 3 ? styles.dotVisible : styles.dotHidden]}>.</Text>
                                    </View>
                                </View>
                            ) : (
                                <Text style={[styles.text, isUser && styles.userText]}>{activityText}</Text>
                            )
                        )
                )}
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    userContainer: {
        justifyContent: 'flex-end',
    },
    systemContainer: {
        justifyContent: 'center',
    },
    bubble: {
        maxWidth: '80%',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.xl,
        backgroundColor: 'transparent',
    },
    userBubble: {
        backgroundColor: colors.background.tertiary,
        borderWidth: 1,
        borderColor: colors.border.secondary,
        borderBottomRightRadius: radii.sm,
    },
    systemBubble: {
        backgroundColor: colors.surface.systemBubble,
        maxWidth: '90%',
    },
    activityBubble: {
        paddingVertical: spacing.xs,
    },
    activityTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    activityDotsRow: {
        flexDirection: 'row',
        minWidth: 18,
    },
    activityText: {
        color: colors.text.secondary,
    },
    dotVisible: {
        opacity: 1,
    },
    dotHidden: {
        opacity: 0,
    },
    text: {
        fontSize: typography.fontSize.base,
        color: colors.text.primary,
    },
    userText: {
        color: colors.text.primary,
    },
    mdContainer: {
        gap: 2,
    },
    mdLine: {
        lineHeight: 22,
    },
    mdListLine: {
        paddingLeft: 2,
    },
    mdGap: {
        height: 8,
    },
    mdBold: {
        fontWeight: typography.fontWeight.semibold,
    },
    mdItalic: {
        fontStyle: 'italic',
    },
    mdCode: {
        backgroundColor: 'rgba(120, 138, 161, 0.24)',
        fontFamily: 'monospace',
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    mdBullet: {
        color: colors.text.secondary,
    },
    mdHeadingLarge: {
        fontSize: typography.fontSize.lg,
        lineHeight: 26,
        marginTop: 2,
    },
    mdHeadingSmall: {
        fontSize: typography.fontSize.base,
    },
});
