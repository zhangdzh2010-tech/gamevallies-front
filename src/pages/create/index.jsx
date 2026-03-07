import React, { useState } from 'react';
import { View, Text, ScrollView, Input, Textarea } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import Taro from '@tarojs/taro';
import { useGameStore } from '../../store/gameStore';
import './index.scss';









const TEMPLATES = [
{
  id: '1',
  name: '2048',
  emoji: '🎮',
  description: '合并数字的经典益智游戏',
  difficulty: '初级'
},
{
  id: '2',
  name: '飞翔小鸟',
  emoji: '🐦',
  description: '躲避障碍的反应类游戏',
  difficulty: '初级'
},
{
  id: '3',
  name: '音乐节奏',
  emoji: '🎵',
  description: '跟随节奏点击的音乐游戏',
  difficulty: '中级'
},
{
  id: '4',
  name: '消消乐',
  emoji: '💎',
  description: '消除相同元素的策略游戏',
  difficulty: '中级'
}];









export default function Create() {
  const navigation = useNavigation();
  const { createGame, isGenerating, generationProgress } = useGameStore();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    selectedTemplate: '',
    thumbnail: ''
  });
  const [showTemplates, setShowTemplates] = useState(true);

  const handleTemplateSelect = (templateId) => {
    setFormData((prev) => ({
      ...prev,
      selectedTemplate: templateId
    }));
    setShowTemplates(false);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      Taro.showToast({
        title: '请输入游戏名称',
        icon: 'none'
      });
      return;
    }

    if (!formData.description.trim()) {
      Taro.showToast({
        title: '请输入游戏描述',
        icon: 'none'
      });
      return;
    }

    if (!formData.selectedTemplate) {
      Taro.showToast({
        title: '请选择游戏模板',
        icon: 'none'
      });
      return;
    }

    try {
      const prompt = `游戏名称：${formData.title}。模板：${selectedTemplate?.name || ''}。描述：${formData.description}`;
      await createGame(prompt);

      Taro.showToast({ title: '游戏生成中，请稍候...', icon: 'none' });

      setFormData({ title: '', description: '', selectedTemplate: '', thumbnail: '' });
      setShowTemplates(true);

      setTimeout(() => {
        navigation.switchTab({ url: '/pages/index/index' });
      }, 1500);
    } catch (error) {
      Taro.showToast({ title: error.message || '创建失败，请重试', icon: 'none' });
    }
  };

  const selectedTemplate = TEMPLATES.find(
    (t) => t.id === formData.selectedTemplate
  );

  return (
    <View className="create-container">
      {/* Header */}
      <View className="create-header">
        <Text className="header-title">➕ 创作新游戏</Text>
        <Text className="header-subtitle">用AI助力你的游戏创意</Text>
      </View>

      <ScrollView className="create-scroll" scrollY>
        {showTemplates ?
        // Template Selection
        <View className="template-section">
            <Text className="section-title">选择游戏模板</Text>
            <View className="template-grid">
              {TEMPLATES.map((template) =>
            <View
              key={template.id}
              className="template-card"
              onClick={() => handleTemplateSelect(template.id)}>
              
                  <Text className="template-emoji">{template.emoji}</Text>
                  <Text className="template-name">{template.name}</Text>
                  <Text className="template-desc">{template.description}</Text>
                  <View className="template-difficulty">
                    {template.difficulty}
                  </View>
                </View>
            )}
            </View>
          </View> :

        // Form Section
        <View className="form-section">
            <View className="form-header">
              <View
              className="back-link"
              onClick={() => setShowTemplates(true)}>
              
                ← 选择其他模板
              </View>
            </View>

            {selectedTemplate &&
          <View className="selected-template">
                <Text className="template-emoji">{selectedTemplate.emoji}</Text>
                <Text className="template-name">{selectedTemplate.name}</Text>
              </View>
          }

            <View className="form-group">
              <Text className="form-label">游戏名称</Text>
              <Input
              className="form-input"
              type="text"
              placeholder="输入你的游戏名称"
              placeholderStyle="color: #55516e"
              value={formData.title}
              onInput={(e) =>
              handleInputChange('title', e.detail.value)
              }
              maxLength={50} />
            
              <Text className="input-count">
                {formData.title.length}/50
              </Text>
            </View>

            <View className="form-group">
              <Text className="form-label">游戏描述</Text>
              <Textarea
              className="form-textarea"
              placeholder="描述你的游戏玩法、特点等..."
              placeholderStyle="color: #55516e"
              value={formData.description}
              onInput={(e) =>
              handleInputChange('description', e.detail.value)
              }
              maxLength={200} />
            
              <Text className="input-count">
                {formData.description.length}/200
              </Text>
            </View>

            <View className="ai-suggestions">
              <Text className="ai-title">🤖 AI建议</Text>
              <View className="suggestion-item">
                <Text className="suggestion-icon">💡</Text>
                <Text className="suggestion-text">
                  游戏名称要简洁易记，包含核心玩法关键词效果更好
                </Text>
              </View>
              <View className="suggestion-item">
                <Text className="suggestion-icon">✨</Text>
                <Text className="suggestion-text">
                  详细的描述能帮助玩家更好地理解你的游戏
                </Text>
              </View>
            </View>

            <View className="form-actions">
              <View
              className="submit-btn"
              onClick={handleSubmit}
              style={{
                opacity: isGenerating ? 0.6 : 1,
                pointerEvents: isGenerating ? 'none' : 'auto'
              }}>

                <Text>
                  {isGenerating ? (generationProgress ? `生成中 ${generationProgress.progress || 0}%...` : '生成中...') : '创建游戏'}
                </Text>
              </View>
            </View>
          </View>
        }

        <View className="bottom-spacer" />
      </ScrollView>

      {/* Custom TabBar */}
      <CustomTabBar activeIndex={2} />
    </View>);

}