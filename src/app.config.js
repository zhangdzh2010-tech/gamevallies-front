export default {
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/discover/index',
    'pages/create/index',
    'pages/message/index',
    'pages/profile/index',
  ],

  subPackages: [
    {
      root: 'pages/register',
      pages: ['index'],
    },
    {
      root: 'pages/game',
      pages: ['detail/index', 'play/index', 'play-landscape/index', 'web-shell/index', 'iterate/index', 'fork/index'],
    },
    {
      root: 'pages/subscription',
      pages: ['index', 'history/index'],
    },
  ],

  tabBar: {
    custom: true,
    color: '#55516e',
    selectedColor: '#6e56ff',
    backgroundColor: '#111118',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'images/tab-home.png',
        selectedIconPath: 'images/tab-home-active.png',
      },
      {
        pagePath: 'pages/discover/index',
        text: '发现',
        iconPath: 'images/tab-discover.png',
        selectedIconPath: 'images/tab-discover-active.png',
      },
      {
        pagePath: 'pages/create/index',
        text: '创作',
        iconPath: 'images/tab-create.png',
        selectedIconPath: 'images/tab-create-active.png',
      },
      {
        pagePath: 'pages/message/index',
        text: '消息',
        iconPath: 'images/tab-messages.png',
        selectedIconPath: 'images/tab-messages-active.png',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'images/tab-profile.png',
        selectedIconPath: 'images/tab-profile-active.png',
      },
    ],
  },

  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#08080d',
    navigationBarTitleText: '智了空间',
    navigationBarTextStyle: 'white',
    backgroundColor: '#08080d',
    navigationStyle: 'custom',
  },

  permission: {
    'scope.userLocation': {
      desc: '智了空间需要你的位置信息来优化内容推荐',
    },
  },

  requiredPrivateInfos: [],
  requiredBackgroundModes: ['audio'],
  networkTimeout: {
    request: 30000,
    downloadFile: 30000,
    uploadFile: 30000,
  },
  debug: false,
  functionalPages: false,
  entranceDeclare: {},
};
