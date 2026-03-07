import React, { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import './index.scss';

export default function Login() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Taro.showToast({
        title: '请输入邮箱和密码',
        icon: 'none'
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock successful login
      Taro.setStorage({
        key: 'authToken',
        data: 'mock_token_' + Date.now()
      });

      Taro.showToast({
        title: '登录成功',
        icon: 'success'
      });

      // Navigate to home
      setTimeout(() => {
        navigation.switchTab({
          url: '/pages/index/index'
        });
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    navigation.push({
      url: '/pages/register/index'
    });
  };

  const handleWeChatLogin = async () => {
    setLoading(true);
    try {
      // Simulate WeChat login
      await new Promise((resolve) => setTimeout(resolve, 1500));

      Taro.setStorage({
        key: 'authToken',
        data: 'wechat_token_' + Date.now()
      });

      Taro.showToast({
        title: '微信登录成功',
        icon: 'success'
      });

      setTimeout(() => {
        navigation.switchTab({
          url: '/pages/index/index'
        });
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="login-container">
      <View className="login-content">
        {/* Logo */}
        <View className="logo-section">
          <Text className="logo">PlayForge</Text>
          <Text className="tagline">AI驱动的全民游戏创作平台</Text>
        </View>

        {/* Form */}
        <View className="form-section">
          <View className="input-field">
            <Input
              className="input"
              type="text"
              placeholder="邮箱或用户名"
              placeholderStyle="color: #55516e"
              value={email}
              onInput={(e) => setEmail(e.detail.value)} />
            
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="password"
              placeholder="密码"
              placeholderStyle="color: #55516e"
              value={password}
              onInput={(e) => setPassword(e.detail.value)} />
            
          </View>

          <View
            className="login-btn"
            onClick={handleLogin}
            style={{
              opacity: loading ? 0.6 : 1,
              pointerEvents: loading ? 'none' : 'auto'
            }}>
            
            <Text>{loading ? '登录中...' : '登录'}</Text>
          </View>

          <View className="register-link">
            <Text>没有账号？</Text>
            <Text className="link" onClick={handleRegister}>
              注册
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View className="divider">
          <View className="divider-line" />
          <Text className="divider-text">或</Text>
          <View className="divider-line" />
        </View>

        {/* WeChat Login */}
        <View
          className="wechat-btn"
          onClick={handleWeChatLogin}
          style={{
            opacity: loading ? 0.6 : 1,
            pointerEvents: loading ? 'none' : 'auto'
          }}>
          
          <Text>微信一键登录</Text>
        </View>
      </View>
    </View>);

}