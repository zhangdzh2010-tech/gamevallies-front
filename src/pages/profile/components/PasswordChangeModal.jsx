import { useState } from 'react';
import { View, Text, ScrollView, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { isH5Runtime } from '../../../utils/runtime';
import './PasswordChangeModal.scss';

/**
 * 密码修改模态框组件
 */
export function PasswordChangeModal({ onClose, onSave }) {
  const isH5 = isH5Runtime();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 密码强度校验
  const validatePassword = (password) => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  });

  const passwordRules = validatePassword(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword !== '';

  // 提交密码修改
  const handleSubmit = async () => {
    // 表单验证
    if (!currentPassword) {
      Taro.showToast({ title: '请输入当前密码', icon: 'none' });
      return;
    }
    if (!Object.values(passwordRules).every(Boolean)) {
      Taro.showToast({ title: '密码强度不够', icon: 'none' });
      return;
    }
    if (!passwordsMatch) {
      Taro.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
      return;
    }

    setLoading(true);
    try {
      // TODO: 集成真实的密码修改API
      // await authService.changePassword({ currentPassword, newPassword });
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Taro.showToast({ title: '密码修改成功', icon: 'success' });
      onSave && onSave();
      onClose();
    } catch (error) {
      Taro.showToast({ title: error.message || '密码修改失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className={`password-change-modal${isH5 ? ' password-change-modal--h5' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* 模态框头部 */}
        <View className="modal-header">
          <Text className="modal-title">修改密码</Text>
          <View className="modal-close" onClick={onClose}>
            <Text>✕</Text>
          </View>
        </View>

        {/* 表单内容 */}
        <ScrollView scrollY className="modal-body">
          {/* 当前密码 */}
          <View className="form-field">
            <Text className="field-label">当前密码</Text>
            <View className="input-wrapper">
              <Input
                className="form-input"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onInput={(e) => setCurrentPassword(e.detail.value)}
                placeholder="请输入当前密码"
              />
              <Text 
                className="password-toggle"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? '🙈' : '👁️'}
              </Text>
            </View>
          </View>

          {/* 新密码 */}
          <View className="form-field">
            <Text className="field-label">新密码</Text>
            <View className="input-wrapper">
              <Input
                className="form-input"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onInput={(e) => setNewPassword(e.detail.value)}
                placeholder="至少8位，包含大小写字母、数字"
              />
              <Text 
                className="password-toggle"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? '🙈' : '👁️'}
              </Text>
            </View>
            
            {/* 密码强度指示器 */}
            <View className="password-strength">
              <View className="strength-rules">
                <View className={`rule-item ${passwordRules.length ? 'passed' : ''}`}>
                  <Text className="rule-icon">{passwordRules.length ? '✓' : '○'}</Text>
                  <Text className="rule-text">至少8个字符</Text>
                </View>
                <View className={`rule-item ${passwordRules.uppercase ? 'passed' : ''}`}>
                  <Text className="rule-icon">{passwordRules.uppercase ? '✓' : '○'}</Text>
                  <Text className="rule-text">包含大写字母</Text>
                </View>
                <View className={`rule-item ${passwordRules.lowercase ? 'passed' : ''}`}>
                  <Text className="rule-icon">{passwordRules.lowercase ? '✓' : '○'}</Text>
                  <Text className="rule-text">包含小写字母</Text>
                </View>
                <View className={`rule-item ${passwordRules.number ? 'passed' : ''}`}>
                  <Text className="rule-icon">{passwordRules.number ? '✓' : '○'}</Text>
                  <Text className="rule-text">包含数字</Text>
                </View>
                <View className={`rule-item ${passwordRules.special ? 'passed' : ''}`}>
                  <Text className="rule-icon">{passwordRules.special ? '✓' : '○'}</Text>
                  <Text className="rule-text">包含特殊字符</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 确认新密码 */}
          <View className="form-field">
            <Text className="field-label">确认新密码</Text>
            <View className="input-wrapper">
              <Input
                className={`form-input ${confirmPassword && !passwordsMatch ? 'error' : ''}`}
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onInput={(e) => setConfirmPassword(e.detail.value)}
                placeholder="请再次输入新密码"
              />
              <Text 
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </Text>
            </View>
            {confirmPassword && !passwordsMatch && (
              <Text className="error-text">两次输入的密码不一致</Text>
            )}
          </View>
        </ScrollView>

        {/* 底部按钮 */}
        <View className="modal-footer">
          <View className="btn-cancel" onClick={onClose}>
            <Text>取消</Text>
          </View>
          <View 
            className={`btn-confirm ${loading ? 'loading' : ''} ${!currentPassword || !newPassword || !passwordsMatch ? 'disabled' : ''}`}
            onClick={handleSubmit}
          >
            <Text>{loading ? '修改中...' : '确认修改'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
