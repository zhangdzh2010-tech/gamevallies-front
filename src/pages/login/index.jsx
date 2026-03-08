import React, { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { useAuthStore } from '../../store/authStore';
import './index.scss';

export default function Login() {
  const navigation = useNavigation();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Taro.showToast({ title: '请输入邮箱和密码', icon: 'none' });
      return;
    }

    try {
      await login(email, password);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        navigation.switchTab({ url: '/pages/index/index' });
      }, 1000);
    } catch (error) {
      Taro.showToast({ title: error.message || '登录失败', icon: 'none' });
    }
  };

  const handleRegister = () => {
    navigation.push({ url: '/pages/register/index' });
  };

  const handleWeChatLogin = async () => {
    Taro.showToast({ title: '微信登录暂未开放', icon: 'none' });
  };

  return (
    <View className="login-container">
      <View className="login-content">
        {/* Logo */}
        <View className="logo-section">
          <Text className="logo">创游谷</Text>
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
              opacity: isLoading ? 0.6 : 1,
              pointerEvents: isLoading ? 'none' : 'auto'
            }}>
            
            <Text>{isLoading ? '登录中...' : '登录'}</Text>
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
            opacity: isLoading ? 0.6 : 1,
            pointerEvents: isLoading ? 'none' : 'auto'
          }}>
          
          <Text>微信一键登录</Text>
        </View>
      </View>
    </View>);

}