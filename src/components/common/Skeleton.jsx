import { View } from '@tarojs/components';
import './Skeleton.scss';

/**
 * Generic skeleton primitive used to replace plain "加载中..." text states across
 * feed-style pages. Renders a shimmering placeholder block whose shape mirrors
 * the eventual content so layout doesn't jump on first paint.
 */
export function SkeletonBlock({ className = '', style = {} }) {
  return <View className={`gv-skeleton ${className}`} style={style} />;
}

/**
 * Vertical waterfall skeleton tuned to the home/discover masonry feeds. Renders
 * three columns with staggered card heights to mimic a real masonry layout while
 * data loads.
 */
export function SkeletonFeedGrid({ rows = 4, columns = 3 }) {
  const items = Array.from({ length: rows * columns });
  // Vary card heights so columns look like an actual masonry, not a uniform grid.
  const heightStops = [220, 260, 200, 240, 280, 210];
  return (
    <View className="gv-skeleton-grid">
      {Array.from({ length: columns }).map((_, colIdx) => (
        <View key={`col-${colIdx}`} className="gv-skeleton-grid__col">
          {items
            .filter((__, idx) => idx % columns === colIdx)
            .map((___, idx) => (
              <View key={`cell-${colIdx}-${idx}`} className="gv-skeleton-card">
                <SkeletonBlock
                  className="gv-skeleton-card__cover"
                  style={{ height: `${heightStops[(colIdx * rows + idx) % heightStops.length]}px` }}
                />
                <SkeletonBlock className="gv-skeleton-card__title" />
                <SkeletonBlock className="gv-skeleton-card__title gv-skeleton-card__title--short" />
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Horizontal list skeleton used for profile work/task tiles. Renders N rows of a
 * thumbnail + 2-line text combo.
 */
export function SkeletonListRow({ rows = 3 }) {
  return (
    <View className="gv-skeleton-list">
      {Array.from({ length: rows }).map((_, idx) => (
        <View key={`row-${idx}`} className="gv-skeleton-list__row">
          <SkeletonBlock className="gv-skeleton-list__thumb" />
          <View className="gv-skeleton-list__text">
            <SkeletonBlock className="gv-skeleton-list__line" />
            <SkeletonBlock className="gv-skeleton-list__line gv-skeleton-list__line--short" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default {
  SkeletonBlock,
  SkeletonFeedGrid,
  SkeletonListRow,
};
