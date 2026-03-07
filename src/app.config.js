export default defineAppConfig({
  pages: [
  'pages/index/index',
  'pages/login/index'],

  subPackages: [
  {
    root: 'pages/create',
    pages: ['index']
  },
  {
    root: 'pages/profile',
    pages: ['index']
  },
  {
    root: 'pages/game',
    pages: ['detail/index', 'play/index']
  },
  {
    root: 'pages/discover',
    pages: ['index']
  },
  {
    root: 'pages/messages',
    pages: ['index']
  }],

  preloadRule: {
    'pages/index/index': {
      network: 'all',
      packages: ['pages/create', 'pages/game']
    }
  },
  tabBar: {
    custom: true,
    color: '#55516e',
    selectedColor: '#6e56ff',
    backgroundColor: '#111118',
    list: [
    {
      pagePath: 'pages/index/index',
      text: '广场'
    },
    {
      pagePath: 'pages/discover/index',
      text: '发现'
    },
    {
      pagePath: 'pages/create/index',
      text: '创作'
    },
    {
      pagePath: 'pages/messages/index',
      text: '消息'
    },
    {
      pagePath: 'pages/profile/index',
      text: '我的'
    }]

  },
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#08080d',
    navigationBarTitleText: 'PlayForge',
    navigationBarTextStyle: 'white',
    backgroundColor: '#08080d',
    navigationStyle: 'custom'
  },
  permission: {
    'scope.userLocation': {
      desc: 'PlayForge需要您的位置信息来优化推荐内容'
    },
    'scope.camera': {
      desc: 'PlayForge需要您的摄像头权限来支持游戏功能'
    },
    'scope.record': {
      desc: 'PlayForge需要您的麦克风权限来进行语音聊天'
    }
  },
  requiredPrivateInfos: [],
  requiredBackgroundModes: ['audio'],
  networkTimeout: {
    request: 30000,
    downloadFile: 30000,
    uploadFile: 30000
  },
  debug: false,
  functionalPages: [],
  isNeedOpensoter: false,
  entranceDeclare: [
  {
    groupIdKey: 'wx_group_id_001',
    label: 'PlayForge官方交流群',
    iconUrl: ''
  }]

});