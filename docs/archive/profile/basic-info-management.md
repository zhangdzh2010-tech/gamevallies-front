# 基础信息管理功能设计

## 🔐 密码修改功能

### 界面设计
```jsx
function PasswordChangeModal({ onClose, onSave }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const validatePassword = (password) => {
    const rules = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    return rules;
  };

  const passwordRules = validatePassword(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword !== '';

  const handleSubmit = async () => {
    if (!currentPassword) {
      Taro.showToast({ title: '请输入当前密码', icon: 'none' });
      return;
    }
    if (!passwordRules.length || !passwordRules.uppercase || !passwordRules.lowercase || !passwordRules.number) {
      Taro.showToast({ title: '密码强度不够', icon: 'none' });
      return;
    }
    if (!passwordsMatch) {
      Taro.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword({
        currentPassword,
        newPassword
      });
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
      <View className="password-change-modal" onClick={(e) => e.stopPropagation()}>
        <View className="modal-header">
          <Text className="modal-title">修改密码</Text>
          <View className="modal-close" onClick={onClose}>
            <Text>✕</Text>
          </View>
        </View>

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
                password={!showCurrentPassword}
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
                password={!showNewPassword}
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
                <RuleItem passed={passwordRules.length}>至少8个字符</RuleItem>
                <RuleItem passed={passwordRules.uppercase}>包含大写字母</RuleItem>
                <RuleItem passed={passwordRules.lowercase}>包含小写字母</RuleItem>
                <RuleItem passed={passwordRules.number}>包含数字</RuleItem>
                <RuleItem passed={passwordRules.special}>包含特殊字符</RuleItem>
              </View>
            </View>
          </View>

          {/* 确认新密码 */}
          <View className="form-field">
            <Text className="field-label">确认新密码</Text>
            <View className="input-wrapper">
              <Input
                className={`form-input ${confirmPassword && !passwordsMatch ? 'error' : ''}`}
                type="password"
                value={confirmPassword}
                onInput={(e) => setConfirmPassword(e.detail.value)}
                placeholder="请再次输入新密码"
              />
            </View>
            {confirmPassword && !passwordsMatch && (
              <Text className="error-text">两次输入的密码不一致</Text>
            )}
          </View>
        </ScrollView>

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

function RuleItem({ passed, children }) {
  return (
    <View className={`rule-item ${passed ? 'passed' : ''}`}>
      <Text className="rule-icon">{passed ? '✓' : '○'}</Text>
      <Text className="rule-text">{children}</Text>
    </View>
  );
}
```

## 🛡️ 账号安全设置

### 安全设置页面
```jsx
function SecuritySettings() {
  const [securityInfo, setSecurityInfo] = useState({
    phone: '',
    email: '',
    twoFactorEnabled: false,
    loginAlerts: true,
    passwordLastChanged: null
  });

  const securityItems = [
    {
      id: 'phone',
      title: '手机号',
      subtitle: securityInfo.phone || '未绑定',
      action: '更换',
      type: 'bind',
      icon: '📱'
    },
    {
      id: 'email',
      title: '邮箱地址',
      subtitle: securityInfo.email || '未绑定',
      action: '更换',
      type: 'bind',
      icon: '📧'
    },
    {
      id: 'password',
      title: '登录密码',
      subtitle: securityInfo.passwordLastChanged ? 
        `上次修改：${formatDate(securityInfo.passwordLastChanged)}` : '未设置',
      action: '修改',
      type: 'change_password',
      icon: '🔐'
    },
    {
      id: 'two_factor',
      title: '双重认证',
      subtitle: securityInfo.twoFactorEnabled ? '已开启' : '未开启',
      action: securityInfo.twoFactorEnabled ? '关闭' : '开启',
      type: 'toggle',
      icon: '🛡️',
      value: securityInfo.twoFactorEnabled
    },
    {
      id: 'login_alerts',
      title: '登录提醒',
      subtitle: '异常登录时发送通知',
      action: securityInfo.loginAlerts ? '关闭' : '开启',
      type: 'toggle',
      icon: '🔔',
      value: securityInfo.loginAlerts
    }
  ];

  const handleItemClick = (item) => {
    switch (item.type) {
      case 'change_password':
        setShowPasswordModal(true);
        break;
      case 'toggle':
        toggleSecuritySetting(item.id, !item.value);
        break;
      case 'bind':
        bindAccount(item.id);
        break;
    }
  };

  return (
    <View className="security-settings">
      <View className="settings-header">
        <Text className="settings-title">账号安全</Text>
        <Text className="settings-desc">保护你的账号安全，建议定期更新密码</Text>
      </View>

      <View className="settings-list">
        {securityItems.map((item, index) => (
          <View key={item.id} className="settings-item">
            <View className="item-icon">{item.icon}</View>
            <View className="item-content">
              <Text className="item-title">{item.title}</Text>
              <Text className="item-subtitle">{item.subtitle}</Text>
            </View>
            <View 
              className={`item-action ${item.type === 'toggle' ? 'toggle-action' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              {item.type === 'toggle' ? (
                <View className={`toggle-switch ${item.value ? 'on' : 'off'}`}>
                  <View className="toggle-thumb" />
                </View>
              ) : (
                <Text className="action-text">{item.action}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* 安全提示 */}
      <View className="security-tips">
        <View className="tips-header">
          <Text className="tips-icon">💡</Text>
          <Text className="tips-title">安全提示</Text>
        </View>
        <View className="tips-list">
          <TipItem>定期更换密码，建议每3个月一次</TipItem>
          <TipItem>不要在公共设备上保存登录信息</TipItem>
          <TipItem>开启双重认证可提高账号安全性</TipItem>
          <TipItem>如发现异常登录请及时联系客服</TipItem>
        </View>
      </View>
    </View>
  );
}
```

## 👤 完整资料编辑界面

### 增强版编辑模态框
```jsx
function EnhancedEditProfileModal({ profile, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('basic'); // basic, security, preferences
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'basic', label: '基本信息', icon: '👤' },
    { id: 'security', label: '账号安全', icon: '🛡️' },
    { id: 'preferences', label: '偏好设置', icon: '⚙️' }
  ];

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="enhanced-edit-modal" onClick={(e) => e.stopPropagation()}>
        {/* 模态框头部 */}
        <View className="modal-header">
          <Text className="modal-title">编辑资料</Text>
          <View className="modal-close" onClick={onClose}>
            <Text>✕</Text>
          </View>
        </View>

        {/* 标签页导航 */}
        <View className="tab-navigation">
          {tabs.map(tab => (
            <View 
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Text className="tab-icon">{tab.icon}</Text>
              <Text className="tab-label">{tab.label}</Text>
            </View>
          ))}
        </View>

        {/* 内容区域 */}
        <ScrollView scrollY className="tab-content">
          {activeTab === 'basic' && <BasicInfoForm profile={profile} />}
          {activeTab === 'security' && <SecuritySettingsContent />}
          {activeTab === 'preferences' && <PreferencesForm />}
        </ScrollView>

        {/* 底部按钮 */}
        <View className="modal-footer">
          <View className="btn-cancel" onClick={onClose}>
            <Text>取消</Text>
          </View>
          <View 
            className={`btn-save ${saving ? 'loading' : ''}`}
            onClick={handleSaveAll}
          >
            <Text>{saving ? '保存中...' : '保存全部'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
```

## 📱 在增强设计中标注未实现功能

在之前的 enhanced-design.md 中添加以下内容：

### 功能状态标识
```markdown
## 🚧 功能开发状态

### ✅ 已实现功能
- [x] 基础资料展示（头像、昵称、简介）
- [x] 头像上传和修改
- [x] 基础游戏数据统计
- [x] 关注和粉丝管理

### 🚧 功能开发中（占位符设计）
- [ ] **数据中心模块** - 创作趋势分析
  ```jsx
  // TODO: 接入数据分析API
  // function AnalyticsDashboard() {
  //   return <View className="coming-soon">数据中心功能开发中...</View>;
  // }
  ```
  
- [ ] **收益中心模块** - 收益分析和提现
  ```jsx
  // TODO: 集成支付和财务API
  // function EarningsCenter() {
  //   return <View className="coming-soon">收益功能开发中...</View>;
  // }
  ```

- [ ] **高级安全设置** - 双重认证、设备管理
- [ ] **创作者工具箱** - AI助手、模板库
- [ ] **社交功能** - 创作者动态、消息中心

### 📋 待排期功能
- [ ] 实时数据推送
- [ ] 跨设备同步
- [ ] 批量操作优化
- [ ] 高级隐私设置
```

### 占位符组件设计
```jsx
// components/common/ComingSoon.jsx
function ComingSoon({ feature, estimatedDate }) {
  return (
    <View className="coming-soon-placeholder">
      <View className="placeholder-icon">🚧</View>
      <Text className="placeholder-title">{feature}功能开发中</Text>
      <Text className="placeholder-desc">我们正在努力为你打造更强大的功能</Text>
      {estimatedDate && (
        <Text className="placeholder-date">预计上线时间：{estimatedDate}</Text>
      )}
      <View className="placeholder-animation">
        <View className="building-blocks">
          <View className="block block-1" />
          <View className="block block-2" />
          <View className="block block-3" />
        </View>
      </View>
    </View>
  );
}

// 使用示例
function AnalyticsDashboard() {
  return (
    <ComingSoon 
      feature="数据中心"
      estimatedDate="2024年Q2"
    />
  );
}
```

## 🎨 样式设计补充

### 密码修改模态框样式
```scss
.password-change-modal {
  .password-strength {
    margin-top: 16rpx;
    
    .strength-rules {
      display: flex;
      flex-direction: column;
      gap: 8rpx;
      
      .rule-item {
        display: flex;
        align-items: center;
        gap: 12rpx;
        font-size: 24rpx;
        color: #8b87a3;
        
        &.passed {
          color: #22c55e;
          
          .rule-icon::before {
            content: '✓';
          }
        }
        
        .rule-icon::before {
          content: '○';
          color: #55516e;
        }
      }
    }
  }
  
  .password-toggle {
    padding: 10rpx;
    font-size: 32rpx;
    cursor: pointer;
  }
}

.security-settings {
  .settings-item {
    display: flex;
    align-items: center;
    padding: 32rpx;
    background: #1a1a2e;
    border-radius: 16rpx;
    margin-bottom: 16rpx;
    
    .item-icon {
      font-size: 40rpx;
      margin-right: 24rpx;
    }
    
    .item-content {
      flex: 1;
      
      .item-title {
        font-size: 32rpx;
        color: #ffffff;
        margin-bottom: 8rpx;
      }
      
      .item-subtitle {
        font-size: 26rpx;
        color: #8b87a3;
      }
    }
  }
}

.coming-soon-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 60rpx;
  text-align: center;
  
  .placeholder-icon {
    font-size: 120rpx;
    margin-bottom: 40rpx;
  }
  
  .placeholder-title {
    font-size: 36rpx;
    color: #ffffff;
    font-weight: 600;
    margin-bottom: 20rpx;
  }
  
  .placeholder-desc {
    font-size: 28rpx;
    color: #8b87a3;
    margin-bottom: 16rpx;
  }
  
  .placeholder-date {
    font-size: 24rpx;
    color: #6e56ff;
    margin-bottom: 60rpx;
  }
}
```

这样设计既保证了现有功能的完整性，又为未来功能预留了清晰的扩展路径，用户在界面上能看到明确的开发进度提示。