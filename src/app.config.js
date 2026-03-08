export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/discover/index',
    'pages/create/index',
    'pages/messages/index',
    'pages/profile/index'
  ],

  subPackages: [
    {
      root: 'pages/register',
      pages: ['index']
    },
    {
      root: 'pages/game',
      pages: ['detail/index', 'play/index']
    }
  ],

  preloadRule: {
    'pages/index/index': {
      network: 'all',
      packages: ['pages/register', 'pages/game']
    }
  },
  tabBar: {
    custom: false,
    color: '#55516e',
    selectedColor: '#6e56ff',
    backgroundColor: '#111118',
    list: [
    {
      pagePath: 'pages/index/index',
      text: '广场',
      iconPath: 'images/tab-home.png',
      selectedIconPath: 'images/tab-home-active.png'
    },
    {
      pagePath: 'pages/discover/index',
      text: '发现',
      iconPath: 'images/tab-discover.png',
      selectedIconPath: 'images/tab-discover-active.png'
    },
    {
      pagePath: 'pages/create/index',
      text: '创作',
      iconPath: 'images/tab-create.png',
      selectedIconPath: 'images/tab-create-active.png'
    },
    {
      pagePath: 'pages/messages/index',
      text: '消息',
      iconPath: 'images/tab-messages.png',
      selectedIconPath: 'images/tab-messages-active.png'
    },
    {
      pagePath: 'pages/profile/index',
      text: '我的',
      iconPath: 'images/tab-profile.png',
      selectedIconPath: 'images/tab-profile-active.png'
    }]
  },
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#08080d',
    navigationBarTitleText: 'Gamevallies',
    navigationBarTextStyle: 'white',
    backgroundColor: '#08080d',
    navigationStyle: 'custom'
  },
  permission: {
    'scope.userLocation': {
      desc: 'Gamevallies需要您的位置信息来优化推荐内容'
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
  functionalPages: false,
  entranceDeclare: {}
});