import * as FileSystem from 'expo-file-system';
import { CardInstance } from '../types';

const SERVER = 'http://192.168.86.193:5050';

function sleeveId(card: CardInstance): number {
  if (card.place === 'commander') return 1;
  return parseInt(card.place, 10) + 1;
}

/**
 * POST each card's local image to /display?sleeve_id=N.
 * Commander → sleeve 1, place "1" → sleeve 2, etc.
 */
export async function beginGame(
  cards: CardInstance[],
  onProgress?: (sent: number, total: number) => void,
): Promise<void> {
  const sorted = [...cards].sort((a, b) => {
    if (a.place === 'commander') return -1;
    if (b.place === 'commander') return 1;
    return parseInt(a.place, 10) - parseInt(b.place, 10);
  });

  const eligible = sorted.filter(c => c.imagePath);
  let sent = 0;

  for (const card of eligible) {
    const id = sleeveId(card);
    try {
      await FileSystem.uploadAsync(
        `${SERVER}/display?sleeve_id=${id}`,
        card.imagePath,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'image/jpeg' },
        },
      );
    } catch (e) {
      console.warn(`sleeve ${id} upload failed:`, e);
    }
    sent++;
    onProgress?.(sent, eligible.length);
  }
}
