import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Input, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import * as authService from '../../services/auth';
import { consumeLoginHint, handleLoginBackNavigation, navigateAfterLogin } from '../../utils/authNavigation';
import { isH5Runtime, isWechatBrowserRuntime } from '../../utils/runtime';
import './index.scss';

const COOLDOWN = 60;

function getSmsErrorMessage(error) {
  if (error?.code === 'HTTP_500') {
    return '短信服务暂不可用，请先使用微信登录或密码登录';
  }
  return error?.message || '发送失败，请重试';
}

function buildWechatUserInfo(nickname, avatarUrl) {
  const safeNickname = typeof nickname === 'string' ? nickname.trim() : '';
  const safeAvatarUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';

  if (!safeNickname && !safeAvatarUrl) {
    return null;
  }

  return {
    nickName: safeNickname,
    avatarUrl: safeAvatarUrl,
  };
}

export default function Login() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const isH5 = isH5Runtime();
  const isWechatH5LoginEnabled = isH5 && authService.isWechatH5LoginEnabled();
  const showWechatLogin = isWeapp || isWechatH5LoginEnabled;
  const [mode, setMode] = useState('password');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loadingAction, setLoadingAction] = useState(null);
  const [wechatNickname, setWechatNickname] = useState('');
  const [wechatAvatarUrl, setWechatAvatarUrl] = useState('');
  const [loginHint, setLoginHintState] = useState('');
  const timerRef = useRef(null);
  const h5WechatAuthHandledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const hint = consumeLoginHint();
    if (hint) {
      setLoginHintState(hint);
    }
  }, []);

  useEffect(() => {
    if (!isH5 || h5WechatAuthHandledRef.current) {
      return;
    }

    const { code: wechatCode, state: wechatState } = authService.getWechatH5AuthParams();
    if (!isWechatH5LoginEnabled) {
      if (wechatCode || wechatState) {
        authService.clearWechatH5AuthParams();
      }
      return;
    }

    if (!wechatCode) {
      return;
    }

    h5WechatAuthHandledRef.current = true;

    const completeWechatH5Login = async () => {
      try {
        setLoadingAction('wechat');
        await authService.loginByWechatH5AuthCode(wechatCode, wechatState);
        authService.clearWechatH5AuthParams();
        Taro.showToast({ title: '微信授权登录成功', icon: 'success' });
        finishLogin();
      } catch (error) {
        authService.clearWechatH5AuthParams();
        Taro.showToast({ title: error.message || '微信授权登录失败', icon: 'none' });
      } finally {
        setLoadingAction(null);
      }
    };

    void completeWechatH5Login();
  }, [isH5, isWechatH5LoginEnabled]);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const canSend = isPhoneValid && countdown === 0;
  const isBusy = loadingAction !== null;

  const finishLogin = () => {
    navigateAfterLogin('/pages/index/index');
  };

  const handleChooseAvatar = (event) => {
    const avatarUrl = event?.detail?.avatarUrl || '';

    if (!avatarUrl) {
      Taro.showToast({ title: '头像选择失败，请重试', icon: 'none' });
      return;
    }

    setWechatAvatarUrl(avatarUrl);
  };

  const handleSendCode = async () => {
    if (!canSend || isBusy) return;

    try {
      await authService.sendSmsCode(phone, 'login');
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

  const handlePasswordLogin = async () => {
    if (isBusy) return;

    if (!account.trim()) {
      Taro.showToast({ title: '请输入手机号或用户名', icon: 'none' });
      return;
    }

    if (password.length < 6) {
      Taro.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    try {
      setLoadingAction('password');
      await authService.login(account.trim(), password);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      finishLogin();
    } catch (error) {
      Taro.showToast({ title: error.message || '账号或密码错误', icon: 'none' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSmsLogin = async () => {
    if (isBusy) return;

    if (!isPhoneValid) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (code.length !== 6) {
      Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }

    try {
      setLoadingAction('sms');
      await authService.loginByPhone(phone, code);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      finishLogin();
    } catch (error) {
      Taro.showToast({ title: error.message || '登录失败', icon: 'none' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleWechatLogin = async () => {
    if (isBusy) return;

    if (isH5) {
      if (!isWechatBrowserRuntime()) {
        Taro.showToast({ title: '请在微信内打开当前页面后再使用微信授权登录', icon: 'none' });
        return;
      }

      try {
        setLoadingAction('wechat');
        await authService.startWechatH5Login();
      } catch (error) {
        Taro.showToast({ title: error.message || '微信授权登录失败', icon: 'none' });
        setLoadingAction(null);
      }
      return;
    }

    if (!isWeapp) {
      Taro.showToast({ title: '请在微信小程序中使用', icon: 'none' });
      return;
    }

    if (!wechatNickname.trim()) {
      Taro.showToast({ title: '请先填写微信昵称', icon: 'none' });
      return;
    }

    if (!wechatAvatarUrl.trim()) {
      Taro.showToast({ title: '请先选择微信头像', icon: 'none' });
      return;
    }

    try {
      setLoadingAction('wechat');
      const loginResult = await Taro.login();
      if (!loginResult.code) {
        throw new Error('未获取到微信登录 code');
      }

      const wechatUserInfo = buildWechatUserInfo(wechatNickname, wechatAvatarUrl);
      await authService.loginByWechatMiniapp(loginResult.code, wechatUserInfo);
      Taro.showToast({ title: '微信登录成功', icon: 'success' });
      finishLogin();
    } catch (error) {
      Taro.showToast({ title: error.message || '微信登录失败', icon: 'none' });
    } finally {
      setLoadingAction(null);
    }
  };

  const passwordBtnText = loadingAction === 'password' ? '登录中...' : '登录';
  const smsBtnText = loadingAction === 'sms' ? '登录中...' : '登录';
  const wechatProfileComplete = Boolean(wechatNickname.trim()) && Boolean(wechatAvatarUrl.trim());
  const wechatWeappDisabled = isWeapp && !wechatProfileComplete;
  const wechatBtnText = loadingAction === 'wechat'
    ? (isH5 ? '跳转微信授权中...' : '登录中...')
    : (isH5
      ? '微信授权登录'
      : (wechatWeappDisabled ? '请先完善微信资料' : '微信登录'));

  return (
    <View className={`login-container${isWeapp ? ' login-container--weapp' : ''}${isH5 ? ' login-container--h5' : ''}`}>
      <View className="back-header" onClick={handleLoginBackNavigation}>
        <Text className="back-arrow">←</Text>
        <Text className="back-text">返回</Text>
      </View>

      <View className="login-content">
        <View className="logo-section">
          <Text className="logo">智了空间</Text>
          <Text className="tagline">AI 驱动的全民游戏创作平台</Text>
        </View>

        {loginHint ? (
          <View className="login-hint-banner">
            <Text className="login-hint-banner__text">{loginHint}</Text>
          </View>
        ) : null}

        <View className="login-tabs">
          <View
            className={`login-tab ${mode === 'password' ? 'active' : ''}`}
            onClick={() => !isBusy && setMode('password')}
          >
            <Text>密码登录</Text>
          </View>
          <View
            className={`login-tab ${mode === 'sms' ? 'active' : ''}`}
            onClick={() => !isBusy && setMode('sms')}
          >
            <Text>短信登录</Text>
          </View>
        </View>

        <View className="form-section">
          {mode === 'password' ? (
            <>
              <View className="input-field">
                <Input
                  className="input"
                  type="text"
                  placeholder="手机号或用户名"
                  placeholderStyle="color: #55516e"
                  value={account}
                  onInput={(e) => setAccount(e.detail.value)}
                />
              </View>

              <View className="input-field">
                <Input
                  className="input"
                  type="text"
                  password
                  placeholder="请输入密码"
                  placeholderStyle="color: #55516e"
                  maxlength={128}
                  value={password}
                  onInput={(e) => setPassword(e.detail.value)}
                />
              </View>

              <View
                className={`login-btn ${isBusy && loadingAction !== 'password' ? 'is-disabled' : ''}`}
                onClick={handlePasswordLogin}
                style={{ pointerEvents: isBusy ? 'none' : 'auto' }}
              >
                <Text>{passwordBtnText}</Text>
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
                  placeholder="6 位验证码"
                  placeholderStyle="color: #55516e"
                  maxlength={6}
                  value={code}
                  onInput={(e) => setCode(e.detail.value)}
                />
                <View
                  className={`send-code-btn ${!canSend || isBusy ? 'disabled' : ''}`}
                  onClick={handleSendCode}
                >
                  <Text>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
                </View>
              </View>

              <View
                className={`login-btn ${isBusy && loadingAction !== 'sms' ? 'is-disabled' : ''}`}
                onClick={handleSmsLogin}
                style={{ pointerEvents: isBusy ? 'none' : 'auto' }}
              >
                <Text>{smsBtnText}</Text>
              </View>
            </>
          )}

          <View className="register-link">
            <Text>没有账号？</Text>
            <Text className="link" onClick={() => !isBusy && Taro.navigateTo({ url: '/pages/register/index' })}>
              注册
            </Text>
          </View>
        </View>

        {showWechatLogin && (
          <>
            <View className="divider">
          <View className="divider-line" />
          <Text className="divider-text">或</Text>
          <View className="divider-line" />
        </View>

            {isWeapp && (
          <View className="wechat-profile-card">
            <View className="wechat-profile-card__header">
              <Text className="wechat-profile-card__title">完善微信资料 · 步骤 1/2</Text>
              <Text className="wechat-profile-card__desc">先选择头像并填写昵称，才能进入下一步登录</Text>
            </View>

            <View className="wechat-profile-card__row">
              <Button
                className="wechat-avatar-picker"
                openType="chooseAvatar"
                onChooseAvatar={handleChooseAvatar}
              >
                {wechatAvatarUrl ? (
                  <Image className="wechat-avatar-picker__image" src={wechatAvatarUrl} mode="aspectFill" />
                ) : (
                  <Text className="wechat-avatar-picker__placeholder">选择头像</Text>
                )}
              </Button>

              <View className="wechat-nickname-field">
                <Input
                  className="input"
                  type="nickname"
                  placeholder="请输入微信昵称"
                  placeholderStyle="color: #55516e"
                  maxlength={20}
                  value={wechatNickname}
                  onInput={(e) => setWechatNickname(e.detail.value)}
                />
              </View>
            </View>

            <Text className="wechat-profile-card__tip">
              微信小程序不再自动返回真实头像和昵称，需要你主动选择后再同步到账户资料。这一步不会泄露你的微信原始信息。
            </Text>
          </View>
        )}

            {isWeapp && !wechatProfileComplete && (
              <Text className="wechat-login-hint">完善头像与昵称后，按钮即可点亮，再点一次完成登录</Text>
            )}

            <View
              className={`wechat-btn ${(isBusy && loadingAction !== 'wechat') || wechatWeappDisabled ? 'is-disabled' : ''}`}
              onClick={handleWechatLogin}
              style={{ pointerEvents: isBusy || wechatWeappDisabled ? 'none' : 'auto' }}
            >
              <Text>{wechatBtnText}</Text>
            </View>

            {isH5 && loadingAction !== 'wechat' && (
              <Text className="wechat-login-hint">点击后将跳转至微信完成授权，完成后会自动返回当前页面</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}
