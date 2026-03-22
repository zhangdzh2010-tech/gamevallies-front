import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { useAuthStore } from '../../store/authStore';
import * as authService from '../../services/auth';
import './index.scss';

const COOLDOWN = 60;

function getSmsErrorMessage(error) {
  if (error?.code === 'HTTP_500') {
    return '短信服务暂不可用，请稍后再试';
  }
  return error?.message || '发送失败，请重试';
}

export default function Register() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const navigation = useNavigation();
  const { registerByPhone, isLoading } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const canSend = isPhoneValid && countdown === 0;

  const handleSendCode = async () => {
    if (!canSend) return;
    try {
      await authService.sendSmsCode(phone, 'register');
      Taro.showToast({ title: '验证码已发送', icon: 'success', duration: 1500 });
      setCountdown(COOLDOWN);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setCountdown((current) => {
          if (current <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (error) {
      Taro.showToast({ title: getSmsErrorMessage(error), icon: 'none' });
    }
  };

  const handleRegister = async () => {
    if (!isPhoneValid) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (code.length !== 6) {
      Taro.showToast({ title: '请输入6位验证码', icon: 'none' });
      return;
    }
    if (!nickname.trim()) {
      Taro.showToast({ title: '请输入你的昵称', icon: 'none' });
      return;
    }
    if (password.length < 6) {
      Taro.showToast({ title: '密码至少6位', icon: 'none' });
      return;
    }
    if (password !== confirmPassword) {
      Taro.showToast({ title: '两次密码输入不一致', icon: 'none' });
      return;
    }

    try {
      await registerByPhone(phone, code, nickname.trim(), password);
      Taro.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => navigation.switchTab({ url: '/pages/index/index' }), 800);
    } catch (error) {
      Taro.showToast({ title: error.message || '注册失败，请重试', icon: 'none' });
    }
  };

  return (
    <View className={`register-container${isWeapp ? ' register-container--weapp' : ''}`}>
      <View className="back-header" onClick={() => navigation.back()}>
        <Text className="back-arrow">‹</Text>
        <Text className="back-text">返回</Text>
      </View>

      <View className="register-content">
        <View className="logo-section">
          <Text className="logo">智了空间</Text>
          <Text className="tagline">创建你的账号</Text>
        </View>

        <View className="form-section">
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
            <View className={`send-code-btn ${!canSend ? 'disabled' : ''}`} onClick={handleSendCode}>
              <Text>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
            </View>
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="text"
              placeholder="给自己起个昵称（必填）"
              placeholderStyle="color: #55516e"
              maxlength={20}
              value={nickname}
              onInput={(e) => setNickname(e.detail.value)}
            />
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="text"
              password
              placeholder="设置登录密码（至少6位）"
              placeholderStyle="color: #55516e"
              maxlength={128}
              value={password}
              onInput={(e) => setPassword(e.detail.value)}
            />
          </View>

          <View className="input-field">
            <Input
              className="input"
              type="text"
              password
              placeholder="再次输入密码"
              placeholderStyle="color: #55516e"
              maxlength={128}
              value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)}
            />
          </View>

          <View
            className="register-btn"
            onClick={handleRegister}
            style={{ opacity: isLoading ? 0.6 : 1, pointerEvents: isLoading ? 'none' : 'auto' }}
          >
            <Text>{isLoading ? '注册中...' : '注册'}</Text>
          </View>

          <View className="login-link">
            <Text>已有账号？</Text>
            <Text className="link" onClick={() => navigation.back()}>返回登录</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
