# 用户资料管理增强设计方案

## 🎯 设计目标
打造专业游戏创作者档案，突出创作能力与商业价值，提升用户粘性和转化

## 🚧 功能开发状态

### ✅ 已实现功能
- [x] 基础资料展示（头像、昵称、简介）
- [x] 头像上传和修改
- [x] 基础游戏数据统计
- [x] 关注和粉丝管理
- [x] 基础设置页面跳转

### 🚧 功能开发中（占位符设计）
- [ ] **数据中心模块** - 创作趋势分析
- [ ] **收益中心模块** - 收益分析和提现
- [ ] **高级安全设置** - 双重认证、设备管理
- [ ] **创作者工具箱** - AI助手、模板库
- [ ] **社交功能** - 创作者动态、消息中心

### 📋 待排期功能
- [ ] 实时数据推送
- [ ] 跨设备同步
- [ ] 批量操作优化
- [ ] 高级隐私设置

## 📊 核心数据维度

## 📊 核心数据维度

### 1. 创作者等级体系
```javascript
const CREATOR_LEVELS = {
  NEWBIE: { minGames: 0,  minPlays: 0,     badge: '🌱', title: '新手创作者' },
  ADVANCED: { minGames: 5,  minPlays: 1000,   badge: '🚀', title: '进阶创作者' },
  EXPERT: { minGames: 20, minPlays: 10000,  badge: '⭐', title: '专业创作者' },
  MASTER: { minGames: 50, minPlays: 100000, badge: '👑', title: '大师创作者' }
};
```

### 2. 影响力指标体系
- **创作力**: 总游戏数、发布频率、原创度
- **传播力**: 总播放量、分享数、复刻数  
- **吸引力**: 粉丝数、关注转化率、回访率
- **变现力**: 收益金额、付费用户数、客单价

## 🎨 UI布局设计

### 顶部个人信息区
```jsx
function ProfileHeader({ user, stats, subscription }) {
  return (
    <View className="profile-header">
      {/* 左侧身份区 */}
      <View className="identity-section">
        <View className="avatar-wrapper">
          <Image src={user.avatar} className="avatar" />
          <CreatorLevelBadge level={user.level} />
          {subscription.active && <SubscriptionBadge plan={subscription.plan} />}
        </View>
        
        <View className="user-info">
          <View className="name-row">
            <Text className="nickname">{user.nickname}</Text>
            <VerificationBadge verified={user.verified} />
          </View>
          <Text className="bio">{user.bio}</Text>
          
          {/* 创作者标签 */}
          <View className="creator-tags">
            {user.tags.map(tag => <Tag key={tag} type="creator">{tag}</Tag>)}
          </View>
          
          {/* 创作理念 */}
          {user.motto && (
            <View className="creator-motto">
              <Text className="motto-label">创作理念:</Text>
              <Text className="motto-text">「{user.motto}」</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* 右侧数据区 */}
      <View className="stats-section">
        <View className="primary-stats">
          <StatCard label="粉丝" value={stats.followers} trend={stats.followerTrend} />
          <StatCard label="作品" value={stats.totalGames} trend={stats.gameTrend} />
          <StatCard label="播放" value={formatNumber(stats.totalPlays)} trend={stats.playTrend} />
          <StatCard label="获赞" value={formatNumber(stats.totalLikes)} trend={stats.likeTrend} />
        </View>
        
        {/* 商业化数据 */}
        {subscription.active && (
          <View className="commercial-stats">
            <StatCard label="订阅收入" value={`¥${stats.monthlyIncome}`} prefix="本月" />
            <StatCard label="创作分成" value={`¥${stats.royaltyIncome}`} prefix="累计" />
          </View>
        )}
      </View>
    </View>
  );
}
```

### 导航架构
```jsx
const PROFILE_TABS = [
  { id: 'works', label: '我的作品', icon: '🎮', countKey: 'totalGames' },
  { id: 'collections', label: '收藏夹', icon: '⭐', countKey: 'bookmarks' },
  { id: 'analytics', label: '数据中心', icon: '📊', badge: 'NEW' },
  { id: 'earnings', label: '收益中心', icon: '💰', badge: subscription.active ? null : '开通会员' },
  { id: 'community', label: '社区', icon: '👥', countKey: 'mutualFollows' },
  { id: 'settings', label: '设置', icon: '⚙️' }
];
```

## 🚀 新增功能模块

### 1. 数据中心模块
```jsx
function AnalyticsDashboard({ userId }) {
  return (
    <View className="analytics-dashboard">
      {/* 创作概览 */}
      <View className="overview-cards">
        <OverviewCard title="创作活跃度" value={85} unit="%" chart="radial" />
        <OverviewCard title="平均质量分" value={4.2} unit="/5" chart="sparkline" />
        <OverviewCard title="粉丝增长率" value={12} unit="%" chart="trend" />
      </View>
      
      {/* 趋势图表 */}
      <View className="charts-section">
        <LineChart title="近30天播放趋势" data={playTrendData} />
        <PieChart title="游戏类型分布" data={genreDistribution} />
        <BarChart title="最佳发布时段" data={publishTimeData} />
      </View>
      
      {/* 热门作品排行 */}
      <View className="top-performers">
        <Text className="section-title">热门作品 TOP 5</Text>
        {topGames.map(game => <GameRankCard key={game.id} game={game} rank={index + 1} />)}
      </View>
    </View>
  );
}
```

### 2. 收益中心模块
```jsx
function EarningsCenter({ earnings }) {
  return (
    <View className="earnings-center">
      {/* 收益概览 */}
      <View className="earnings-overview">
        <EarningsCard type="today" amount={earnings.today} trend={earnings.todayTrend} />
        <EarningsCard type="month" amount={earnings.thisMonth} trend={earnings.monthTrend} />
        <EarningsCard type="total" amount={earnings.total} trend={earnings.totalTrend} />
      </View>
      
      {/* 收益来源分析 */}
      <View className="revenue-breakdown">
        <PieChart title="收益构成" data={earnings.breakdown} />
        <RevenueStreamList streams={earnings.streams} />
      </View>
      
      {/* 提现管理 */}
      <WithdrawSection balance={earnings.balance} onWithdraw={handleWithdraw} />
    </View>
  );
}
```

### 3. 创作者工具箱
```jsx
function CreatorToolkit() {
  return (
    <View className="creator-toolkit">
      {/* 快速操作 */}
      <View className="quick-actions">
        <ActionButton icon="🎯" label="AI灵感" onClick={openAIPrompt} />
        <ActionButton icon="📝" label="模板库" onClick={openTemplates} />
        <ActionButton icon="🤝" label="寻找搭档" onClick={findPartner} />
        <ActionButton icon="📈" label="数据分析" onClick={openAnalytics} />
      </View>
      
      {/* 智能推荐 */}
      <View className="smart-recommendations">
        <Text className="section-title">为你推荐</Text>
        <RecommendationCard type="trending_genres" items={trendingGenres} />
        <RecommendationCard type="collab_opportunities" items={collabOpportunities} />
        <RecommendationCard type="learning_resources" items={learningResources} />
      </View>
    </View>
  );
}
```

## 🎨 视觉设计升级

### 占位符组件设计
```jsx
// components/common/ComingSoon.jsx
function ComingSoon({ feature, estimatedDate, description }) {
  return (
    <View className="coming-soon-placeholder">
      <View className="placeholder-animation">
        <View className="building-blocks">
          <View className="block block-1" />
          <View className="block block-2" />
          <View className="block block-3" />
        </View>
      </View>
      
      <View className="placeholder-icon">🚧</View>
      <Text className="placeholder-title">{feature}功能开发中</Text>
      <Text className="placeholder-desc">{description || '我们正在努力为你打造更强大的功能'}</Text>
      
      {estimatedDate && (
        <View className="placeholder-date">
          <Text className="date-label">预计上线：</Text>
          <Text className="date-value">{estimatedDate}</Text>
        </View>
      )}
      
      <View className="placeholder-notice">
        <Text className="notice-text">功能上线后会第一时间通知你</Text>
      </View>
    </View>
  );
}

// 各模块的占位符使用示例
function AnalyticsDashboard() {
  return (
    <ComingSoon 
      feature="数据中心"
      estimatedDate="2024年Q2"
      description="创作趋势分析、热门作品排行、观众画像等功能即将推出"
    />
  );
}

function EarningsCenter() {
  return (
    <ComingSoon 
      feature="收益中心"
      estimatedDate="2024年Q3"
      description="收益分析、提现管理、创作分成明细等功能正在开发中"
    />
  );
}

function CreatorToolkit() {
  return (
    <ComingSoon 
      feature="创作者工具箱"
      estimatedDate="2024年Q2"
      description="AI灵感助手、模板库、协作管理等专业工具即将上线"
    />
  );
}
```

### 基础信息编辑增强
```jsx
// 增强版编辑资料模态框 - 多标签页设计
function EnhancedEditProfileModal({ profile, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'basic', label: '基本信息', icon: '👤', component: BasicInfoForm },
    { id: 'security', label: '账号安全', icon: '🛡️', component: SecuritySettingsContent },
    { id: 'preferences', label: '偏好设置', icon: '⚙️', component: PreferencesForm }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || BasicInfoForm;

  return (
    <View className="enhanced-edit-modal">
      {/* 模态框头部 */}
      <View className="modal-header">
        <Text className="modal-title">编辑资料</Text>
        <View className="modal-close" onClick={onClose}>✕</View>
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
        <ActiveComponent profile={profile} />
      </ScrollView>

      {/* 底部按钮 */}
      <View className="modal-footer">
        <View className="btn-cancel" onClick={onClose}>取消</View>
        <View 
          className={`btn-save ${saving ? 'loading' : ''}`}
          onClick={handleSaveAll}
        >
          <Text>{saving ? '保存中...' : '保存全部'}</Text>
        </View>
      </View>
    </View>
  );
}
```

### 密码修改功能
```jsx
function PasswordChangeModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({});
  const [loading, setLoading] = useState(false);

  // 密码强度校验
  const checkPasswordStrength = (password) => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  });

  const strength = checkPasswordStrength(formData.newPassword);
  const passwordsMatch = formData.newPassword === formData.confirmPassword && formData.newPassword;

  const handleSubmit = async () => {
    // 验证逻辑
    if (!formData.currentPassword) {
      return Taro.showToast({ title: '请输入当前密码', icon: 'none' });
    }
    if (!Object.values(strength).every(Boolean)) {
      return Taro.showToast({ title: '密码强度不够', icon: 'none' });
    }
    if (!passwordsMatch) {
      return Taro.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
    }

    setLoading(true);
    try {
      await authService.changePassword(formData);
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
    <View className="password-change-modal">
      <View className="modal-header">
        <Text className="modal-title">修改密码</Text>
        <View className="modal-close" onClick={onClose}>✕</View>
      </View>

      <ScrollView className="modal-body">
        {/* 当前密码 */}
        <FormField label="当前密码" required>
          <View className="input-wrapper">
            <Input
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onInput={(e) => setFormData(prev => ({...prev, currentPassword: e.detail.value}))}
              placeholder="请输入当前密码"
            />
            <Text className="password-toggle" onClick={() => 
              setShowPasswords(prev => ({...prev, current: !prev.current}))
            }>
              {showPasswords.current ? '🙈' : '👁️'}
            </Text>
          </View>
        </FormField>

        {/* 新密码 */}
        <FormField label="新密码" required>
          <View className="input-wrapper">
            <Input
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onInput={(e) => setFormData(prev => ({...prev, newPassword: e.detail.value}))}
              placeholder="至少8位，包含大小写字母、数字"
            />
            <Text className="password-toggle" onClick={() => 
              setShowPasswords(prev => ({...prev, new: !prev.new}))
            }>
              {showPasswords.new ? '🙈' : '👁️'}
            </Text>
          </View>
          
          {/* 密码强度指示器 */}
          <View className="password-strength">
            <View className="strength-rules">
              <StrengthRule passed={strength.length}>至少8个字符</StrengthRule>
              <StrengthRule passed={strength.uppercase}>包含大写字母</StrengthRule>
              <StrengthRule passed={strength.lowercase}>包含小写字母</StrengthRule>
              <StrengthRule passed={strength.number}>包含数字</StrengthRule>
              <StrengthRule passed={strength.special}>包含特殊字符</StrengthRule>
            </View>
          </View>
        </FormField>

        {/* 确认新密码 */}
        <FormField label="确认新密码" required>
          <View className="input-wrapper">
            <Input
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onInput={(e) => setFormData(prev => ({...prev, confirmPassword: e.detail.value}))}
              placeholder="请再次输入新密码"
              className={confirmPassword ? '' : 'error'}
            />
            <Text className="password-toggle" onClick={() => 
              setShowPasswords(prev => ({...prev, confirm: !prev.confirm}))
            }>
              {showPasswords.confirm ? '🙈' : '👁️'}
            </Text>
          </View>
          {confirmPassword && !passwordsMatch && (
            <Text className="error-text">两次输入的密码不一致</Text>
          )}
        </FormField>
      </ScrollView>

      <View className="modal-footer">
        <View className="btn-cancel" onClick={onClose}>取消</View>
        <View 
          className={`btn-confirm ${loading ? 'loading' : ''} ${!passwordsMatch ? 'disabled' : ''}`}
          onClick={handleSubmit}
        >
          <Text>{loading ? '修改中...' : '确认修改'}</Text>
        </View>
      </View>
    </View>
  );
}
```

### 配色方案
```scss
// 创作者等级色彩
$level-colors: (
  newbie: #8b87a3,
  advanced: #2dd4a8,
  expert: #6e56ff,
  master: linear-gradient(135deg, #ffd700, #ffed4e)
);

// 数据状态色彩
$stat-colors: (
  positive: #22c55e,
  negative: #ef4444,
  neutral: #8b87a3
);

// 功能状态色彩
$feature-colors: (
  coming-soon: #fbbf24,
  in-development: #6e56ff,
  beta: #2dd4a8
);
```

### 动效设计
- **等级徽章**: 升级时的粒子动画效果
- **数据变化**: 数字滚动动画
- **悬停效果**: 卡片3D翻转预览
- **加载状态**: 骨架屏 + 渐变动画

## 📱 响应式适配

### 桌面端 (>768px)
- 左右分栏布局，侧边栏显示详细数据
- 图表支持交互式操作
- 多列卡片网格布局

### 平板端 (768px-480px)  
- 上下分层布局
- 图表简化为趋势箭头
- 双列卡片布局

### 手机端 (<480px)
- 单栏垂直布局
- 图表改为迷你条形图
- 单列卡片，重要数据优先

## 🔧 技术实现要点

### 1. 数据获取策略
```javascript
// 分层数据加载
const useProfileData = (userId) => {
  // 第一层：基础信息（立即加载）
  const basicInfo = useQuery(['profile', userId], () => fetchBasicInfo(userId));
  
  // 第二层：统计数据（延迟加载）
  const stats = useQuery(['profile-stats', userId], () => fetchStats(userId), {
    enabled: !!basicInfo.data
  });
  
  // 第三层：详细分析（按需加载）
  const analytics = useQuery(['analytics', userId], () => fetchAnalytics(userId), {
    enabled: activeTab === 'analytics'
  });
};
```

### 2. 缓存和更新策略
- 基础信息：5分钟缓存
- 统计数据：1小时缓存  
- 分析数据：实时更新
- 图片资源：CDN + 本地缓存

### 3. 性能优化
- 虚拟滚动长列表
- 图表懒加载
- 图片渐进式加载
- 组件按需渲染

这个设计方案将显著提升用户资料的专业度和商业价值展示，有助于创作者生态的建设。