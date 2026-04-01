import { useState, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { isH5Runtime } from '../../../utils/runtime';
import './BottomDrawer.scss';

const QUICK_STATS = [
  { key: 'heat', label: '预计热度', value: '高' },
  { key: 'genre', label: '游戏类型', value: '射击' },
  { key: 'time', label: '预计时长', value: '5-10分钟' },
];

export default function BottomDrawer({
  open,
  onClose,
  gameReady,
  previewData,
  onPlayFullscreen,
  onPublish,
}) {
  const isH5 = isH5Runtime();
  const [startY, setStartY] = useState(0);
  const drawerRef = useRef(null);

  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e) => {
    const endY = e.changedTouches[0].clientY;
    if (endY - startY > 80) {
      onClose();
    }
  };

  const content = (
    <>
      <View className="preview-card">
        <View className="preview-icon-area">
          {previewData.emoji}
        </View>
        <Text className="preview-title">{previewData.title}</Text>
        <View className="preview-status">
          <View className="preview-status__icon" />
          <Text>游戏已生成</Text>
        </View>
      </View>

      <View className="action-buttons">
        <View className="btn btn-primary" onClick={onPlayFullscreen}>
          <View className="btn-icon btn-icon--play" />
          <Text>全屏试玩</Text>
        </View>
        <View className="btn btn-outline" onClick={onPublish}>
          <View className="btn-icon btn-icon--publish" />
          <Text>发布到创意广场</Text>
        </View>
      </View>

      <View className="quick-stats">
        {QUICK_STATS.map((item) => (
          <View key={item.key} className="stat-item">
            <View className={`stat-icon stat-icon--${item.key}`} />
            <View className="stat-content">
              <Text className="stat-label">{item.label}</Text>
              <Text className="stat-value">{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="drawer-footer" />
    </>
  );

  return (
    <>
      {open ? (
        <View className="drawer-overlay" onClick={onClose} />
      ) : null}

      <View
        ref={drawerRef}
        className={`bottom-drawer ${open ? 'open' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <View className="drawer-handle-bar" />

        <View className="drawer-header">
          <Text className="drawer-title">游戏预览</Text>
          <View className="close-btn" onClick={onClose}>
            <Text>收起</Text>
          </View>
        </View>

        {gameReady ? (
          isH5 ? (
            <View className="drawer-content drawer-content--h5">
              {content}
            </View>
          ) : (
            <ScrollView className="drawer-content" scrollY>
              {content}
            </ScrollView>
          )
        ) : (
          <View className="drawer-empty-state">
            <View className="empty-icon" />
            <Text className="empty-text">
              描述创意并发送后{'\n'}游戏预览将在这里出现
            </Text>
          </View>
        )}
      </View>
    </>
  );
}
