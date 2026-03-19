import React, { useRef, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { useAuthStore } from '../../store/authStore';
import * as authService from '../../services/auth';
import './index.scss';

const COOLDOWN = 60;

export default function Login() {
  const navigation = useNavigation();
  const { login, loginByPhone, loginByWechatMiniapp, isLoading } = useAuthStore();
  const [mode, setMode] = useState('password');

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const canSend = isPhoneValid && countdown === 0;

  const handleSendCode = async () => {
    if (!canSend) return;

    try {
      await authService.sendSmsCode(phone, 'login');
      Taro.showToast({ title: '验证码已发送', icon: 'success', duration: 1500 });
      setCountdown(COOLDOWN);
      timerRef.current = setInterval(() => {
        setCountdown((current) => {
          if (current <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (error) {
      Taro.showToast({ title: error.message || '发送失败，请重试', icon: 'none' });
    }
  };

  const handlePasswordLogin = async () => {
    if (!account.trim()) {
      Taro.showToast({ title: '请输入手机号、用户名或邮箱', icon: 'none' });
      return;
    }

    if (password.length < 6) {
      Taro.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    try {
      await login(account.trim(), password);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => navigation.switchTab({ url: '/pages/index/index' }), 800);
    } catch (error) {
      Taro.showToast({ title: error.message || '账号或密码错误', icon: 'none' });
    }
  };

  const handleSmsLogin = async () => {
    if (!isPhoneValid) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (code.length !== 6) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }

    try {
      await loginByPhone(phone, code);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => navigation.switchTab({ url: '/pages/index/index' }), 800);
    } catch (error) {
      Taro.showToast({ title: error.message || '登录失败', icon: 'none' });
    }
  };

  const handleWechatLogin = async () => {
    if (process.env.TARO_ENV !== 'weapp') {
      Taro.showToast({ title: '请在微信小程序中使用微信登录', icon: 'none' });
      return;
    }

    try {
      const profile = await new Promise((resolve) => {
        Taro.getUserProfile({
          desc: '用于完善你的账号资料',
          success: (res) => resolve(res.userInfo || {}),
          fail: () => resolve({}),
        });
      });

      await loginByWechatMiniapp(profile?.nickName, profile?.avatarUrl);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => navigation.switchTab({ url: '/pages/index/index' }), 800);
    } catch (error) {
      Taro.showToast({ title: error.message || '微信登录失败', icon: 'none' });
    }
  };

  return (
    <View className="login-container">
      <View className="back-header" onClick={() => navigation.back()}>
        <Text className="back-arrow">‹</Text>
        <Text className="back-text">返回</Text>
      </View>

      <View className="login-content">
        <View className="logo-section">
          <Text className="logo">智乐空间</Text>
          <Text className="tagline">支持密码、手机号验证码和微信登录</Text>
        </View>

        <View className="login-tabs">
          <View
            className={`login-tab ${mode === 'password' ? 'active' : ''}`}
            onClick={() => setMode('password')}
          >
            <Text>密码登录</Text>
          </View>
          <View
            className={`login-tab ${mode === 'sms' ? 'active' : ''}`}
            onClick={() => setMode('sms')}
          >
            <Text>手机号登录</Text>
          </View>
        </View>

        <View className="form-section">
          {mode === 'password' ? (
            <>
              <View className="input-field">
                <Input
                  className="input"
                  type="text"
                  placeholder="手机号、用户名或邮箱"
                  placeholderStyle="color: #55516e"
                  value={account}
                  onInput={(e) => setAccount(e.detail.value)}
                />
              </View>

              <View className="input-field">
                <Input
                  className="input"
                  type="safe-password"
                  password
                  placeholder="请输入密码"
                  placeholderStyle="color: #55516e"
                  maxlength={128}
                  value={password}
                  onInput={(e) => setPassword(e.detail.value)}
                />
              </View>

              <View
                className="login-btn"
                onClick={handlePasswordLogin}
                style={{ opacity: isLoading ? 0.6 : 1, pointerEvents: isLoading ? 'none' : 'auto' }}
              >
                <Text>{isLoading ? '登录中...' : '密码登录'}</Text>
              </View>
            </>
          ) : (
            <>
              <View className="input-field">
                <Text className="field-prefix">+86</Text>
                <Input
                  className="input"
                  type="number"
                  placeholder="请输入手机号"
                  placeholderStyle="color: #55516e"
                  maxlength={11}
                  value={phone}
                  onInput={(e) => setPhone(e.detail.value)}
                />
              </View>

              <View className="input-field code-field">
                <Input
                  className="input"
                  type="number"
                  placeholder="6位验证码"
                  placeholderStyle="color: #55516e"
                  maxlength={6}
                  value={code}
                  onInput={(e) => setCode(e.detail.value)}
                />
                <View
                  className={`send-code-btn ${!canSend ? 'disabled' : ''}`}
                  onClick={handleSendCode}
                >
                  <Text>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
                </View>
              </View>

              <View
                className="login-btn"
                onClick={handleSmsLogin}
                style={{ opacity: isLoading ? 0.6 : 1, pointerEvents: isLoading ? 'none' : 'auto' }}
              >
                <Text>{isLoading ? '登录中...' : '手机号登录'}</Text>
              </View>
            </>
          )}

          <View className="register-link">
            <Text>没有账号？</Text>
            <Text className="link" onClick={() => navigation.push({ url: '/pages/register/index' })}>
              手机号注册
            </Text>
          </View>
        </View>

        <View className="divider">
          <View className="divider-line" />
          <Text className="divider-text">或</Text>
          <View className="divider-line" />
        </View>

        <View className="wechat-btn" onClick={handleWechatLogin}>
          <Text>{process.env.TARO_ENV === 'weapp' ? '微信一键登录' : '在小程序中使用微信登录'}</Text>
        </View>
      </View>
    </View>
  );
}
