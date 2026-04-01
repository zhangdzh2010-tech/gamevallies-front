import { View, Text } from '@tarojs/components';
import './ComingSoon.scss';

/**
 * 功能开发中占位符组件
 * @param {string} feature - 功能名称
 * @param {string} estimatedDate - 预计上线时间
 * @param {string} description - 功能描述
 */
export function ComingSoon({ feature, estimatedDate, description }) {
  return (
    <View className="coming-soon-placeholder">
      <View className="placeholder-animation">
        <View className="building-blocks">
          <View className="block block-1" />
          <View className="block block-2" />
          <View className="block block-3" />
        </View>
      </View>
      
      <View className="placeholder-icon">🚧</View>
      <Text className="placeholder-title">{feature}功能开发中</Text>
      <Text className="placeholder-desc">{description || '我们正在努力为你打造更强大的功能'}</Text>
      
      {estimatedDate && (
        <View className="placeholder-date">
          <Text className="date-label">预计上线：</Text>
          <Text className="date-value">{estimatedDate}</Text>
        </View>
      )}
      
      <View className="placeholder-notice">
        <Text className="notice-text">功能上线后会第一时间通知你</Text>
      </View>
    </View>
  );
}

/**
 * 数据中心占位符
 */
export function AnalyticsPlaceholder() {
  return (
    <ComingSoon 
      feature="数据中心"
      estimatedDate="2024年Q2"
      description="创作趋势分析、热门作品排行、观众画像等功能即将推出"
    />
  );
}

/**
 * 收益中心占位符
 */
export function EarningsPlaceholder() {
  return (
    <ComingSoon 
      feature="收益中心"
      estimatedDate="2024年Q3"
      description="收益分析、提现管理、创作分成明细等功能正在开发中"
    />
  );
}

/**
 * 创作者工具箱占位符
 */
export function CreatorToolkitPlaceholder() {
  return (
    <ComingSoon 
      feature="创作者工具箱"
      estimatedDate="2024年Q2"
      description="AI灵感助手、模板库、协作管理等专业工具即将上线"
    />
  );
}