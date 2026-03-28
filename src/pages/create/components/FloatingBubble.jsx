import { View, Text } from '@tarojs/components';
import './FloatingBubble.scss';





export default function FloatingBubble({ onClick }) {
  return (
    <View
      className="floating-bubble"
      onClick={onClick}>
      
      <View className="pulse-ring"></View>
      <View className="bubble-content">
        <View className="bubble-icon" />
      </View>
    </View>);

}
