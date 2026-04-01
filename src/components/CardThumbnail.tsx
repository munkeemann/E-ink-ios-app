import React, {useState} from 'react';
import {
  View,
  Image,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {Card} from '../types';

interface Props {
  card: Card;
  /** Show a small badge overlay with this number (e.g. quantity or position) */
  badge?: number;
  onPress?: () => void;
  style?: object;
}

export default function CardThumbnail({card, badge, onPress, style}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}>
      {!error ? (
        <Image
          source={{uri: card.imageUri}}
          style={styles.image}
          resizeMode="cover"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      ) : (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{card.name}</Text>
        </View>
      )}
      {loading && !error && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#c9a84c" />
        </View>
      )}
      {badge !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 140,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2a2a3e',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  errorBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  errorText: {
    color: '#aaa',
    fontSize: 10,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#c9a84c',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
