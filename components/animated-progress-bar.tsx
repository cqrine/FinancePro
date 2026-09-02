import React, { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type AnimatedProgressBarProps = {
  /** 0-100+; values above 100 still render a full bar in the last fill color. */
  percent: number;
  height?: number;
  trackColor?: string;
  /** [low, mid, high] colors interpolated across the 0-80-100 range. */
  fillColors?: [string, string, string];
  style?: StyleProp<ViewStyle>;
};

export function AnimatedProgressBar({
  percent,
  height = 10,
  trackColor = '#e9ecef',
  fillColors = ['#198754', '#ffc107', '#dc3545'],
  style,
}: AnimatedProgressBarProps) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = withSpring(clamped, { damping: 18, stiffness: 120 });
  }, [clamped, progress]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
    backgroundColor: interpolateColor(progress.value, [0, 80, 100], fillColors),
  }));

  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height: '100%', borderRadius: height / 2 }, animatedFillStyle]} />
    </View>
  );
}
