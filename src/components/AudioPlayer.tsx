import { Ionicons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface AudioPlayerProps {
    localPath: string;
    durationMs?: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
    localPath,
    durationMs = 0,
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [positionMs, setPositionMs] = useState(0);
    const [totalDuration, setTotalDuration] = useState(durationMs);
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    const formatTime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (status.isLoaded) {
            setPositionMs(status.positionMillis);
            setIsPlaying(status.isPlaying);
            if (status.durationMillis) {
                setTotalDuration(status.durationMillis);
            }
            if (status.didJustFinish) {
                setIsPlaying(false);
                setPositionMs(0);
                soundRef.current?.setPositionAsync(0);
            }
        }
    };

    const togglePlayback = async () => {
        try {
            if (!soundRef.current) {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: localPath },
                    { shouldPlay: true },
                    onPlaybackStatusUpdate
                );
                soundRef.current = sound;
                setIsPlaying(true);
            } else if (isPlaying) {
                await soundRef.current.pauseAsync();
            } else {
                await soundRef.current.playAsync();
            }
        } catch (error) {
            console.error('Playback error:', error);
        }
    };

    const progress = totalDuration > 0 ? (positionMs / totalDuration) * 100 : 0;

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
                <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={24}
                    color={colors.accent.primary}
                />
            </TouchableOpacity>

            <View style={styles.progressContainer}>
                <View style={styles.progressBackground}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <View style={styles.timeRow}>
                    <Text style={styles.time}>{formatTime(positionMs)}</Text>
                    <Text style={styles.time}>{formatTime(totalDuration)}</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        borderRadius: radii.md,
        padding: spacing.sm,
        minWidth: 200,
    },
    playButton: {
        width: 40,
        height: 40,
        borderRadius: radii.full,
        backgroundColor: colors.background.elevated,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressContainer: {
        flex: 1,
        marginLeft: spacing.md,
    },
    progressBackground: {
        height: 4,
        backgroundColor: colors.border.primary,
        borderRadius: radii.sm,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.accent.primary,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
    },
    time: {
        fontSize: typography.fontSize.xs,
        color: colors.text.secondary,
    },
});
