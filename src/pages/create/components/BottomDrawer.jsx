import { useState, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import './BottomDrawer.scss';


















export default function BottomDrawer({
  open,
  onClose,
  gameReady,
  previewData,
  onPlayFullscreen,
  onPublish
}) {
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

  return (
    <>
      {open &&
      <View
        className="drawer-overlay"
        onClick={onClose} />

      }
      <View
        ref={drawerRef}
        className={`bottom-drawer ${open ? 'open' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}>
        
        <View className="drawer-handle-bar"></View>

        <View className="drawer-header">
          <Text className="drawer-title">🖥️ 游戏预览</Text>
          <Text className="close-btn" onClick={onClose}>
            收起 ↓
          </Text>
        </View>

        {gameReady ?
        <ScrollView className="drawer-content" scrollY>
            <View className="preview-card">
              <View className="preview-icon-area">
                {previewData.emoji}
              </View>
              <Text className="preview-title">
                {previewData.title}
              </Text>
              <Text className="preview-status">✓ 游戏已生成</Text>
            </View>

            <View className="action-buttons">
              <View
              className="btn btn-primary"
              onClick={onPlayFullscreen}>
              
                <Text>▶ 全屏试玩</Text>
              </View>
              <View
              className="btn btn-outline"
              onClick={onPublish}>
              
                <Text>🚀 发布到创意广场</Text>
              </View>
            </View>

            <View className="quick-stats">
              <View className="stat-item">
                <Text className="stat-icon">🔥</Text>
                <View className="stat-content">
                  <Text className="stat-label">预估热度</Text>
                  <Text className="stat-value">高</Text>
                </View>
              </View>
              <View className="stat-item">
                <Text className="stat-icon">📊</Text>
                <View className="stat-content">
                  <Text className="stat-label">游戏类型</Text>
                  <Text className="stat-value">射击</Text>
                </View>
              </View>
              <View className="stat-item">
                <Text className="stat-icon">⏱️</Text>
                <View className="stat-content">
                  <Text className="stat-label">预估时长</Text>
                  <Text className="stat-value">5-10分钟</Text>
                </View>
              </View>
            </View>

            <View className="drawer-footer"></View>
          </ScrollView> :

        <View className="drawer-empty-state">
            <Text className="empty-icon">🎮</Text>
            <Text className="empty-text">
              描述创意并发送后{'\n'}游戏预览将在这里出现
            </Text>
          </View>
        }
      </View>
    </>);

}