import React, { useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { useAuthStore } from '../../store/authStore';
import './index.scss';

export default function Register() {
  const navigation = useNavigation();
  const { register, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = async () => {
    if (!username || !email || !password) {
      Taro.showToast({ title: '请填写所有字段', icon: 'none' });
      return;
    }
    if (username.length < 3) {
      Taro.showToast({ title: '用户名至少3个字符', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      Taro.showToast({ title: '密码至少6个字符', icon: 'none' });
      return;
    }
    if (password !== confirmPassword) {
      Taro.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }

    try {
      await register({ username, email, password });
      Taro.showToast({ title: '注册成功，请登录', icon: 'success' });
      setTimeout(() => {
        navigation.back();
      }, 1000);
    } catch (error) {
      Taro.showToast({ title: error.message || '注册失败，请重试', icon: 'none' });
    }
  };

  return (
    <View className="register-container">
      <View className="register-content">
        <View className="logo-section">
          <Text className="logo">PlayForge</Text>
          <Text className="tagline">创建你的账号</Text>
        </View>

        <View className="form-section">
          <View className="input-field">
            <Input
              className="input"
              type="text"
              placeholder="用户名（3-30个字符）"
              placeholderStyle="color: #55516e"
              value={username}
              onInput={(e) => setUsername(e.detail.value)}
              maxLength={30} />
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="text"
              placeholder="邮箱地址"
              placeholderStyle="color: #55516e"
              value={email}
              onInput={(e) => setEmail(e.detail.value)} />
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="password"
              placeholder="密码（至少6个字符）"
              placeholderStyle="color: #55516e"
              value={password}
              onInput={(e) => setPassword(e.detail.value)} />
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="password"
              placeholder="确认密码"
              placeholderStyle="color: #55516e"
              value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)} />
          </View>

          <View
            className="register-btn"
            onClick={handleRegister}
            style={{
              opacity: isLoading ? 0.6 : 1,
              pointerEvents: isLoading ? 'none' : 'auto'
            }}>
            <Text>{isLoading ? '注册中...' : '注册'}</Text>
          </View>

          <View className="login-link">
            <Text>已有账号？</Text>
            <Text className="link" onClick={() => navigation.back()}>
              返回登录
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
