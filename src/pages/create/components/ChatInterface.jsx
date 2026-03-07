import { View, Text } from '@tarojs/components';
import './ChatInterface.scss';













export default function ChatInterface({
  messages,
  isGenerating
}) {
  return (
    <View className="chat-interface">
      {messages.map((msg) =>
      <View
        key={msg.id}
        className={`message-bubble ${msg.type}`}>
        
          {msg.type === 'ai' &&
        <View className="ai-avatar">
              <Text className="avatar-emoji">✨</Text>
            </View>
        }
          <View className={`bubble-content ${msg.type}`}>
            <Text className="message-text">{msg.content}</Text>
          </View>
        </View>
      )}

      {isGenerating &&
      <View className="generating-indicator">
          <View className="spinner">
            <View className="dot dot-1"></View>
            <View className="dot dot-2"></View>
            <View className="dot dot-3"></View>
          </View>
          <Text className="generating-text">生成中...</Text>
        </View>
      }
    </View>);

}