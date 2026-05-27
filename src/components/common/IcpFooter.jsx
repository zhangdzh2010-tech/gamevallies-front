import { View, Text } from '@tarojs/components';
import { isH5Runtime } from '../../utils/runtime';
import './IcpFooter.scss';

const ICP_RECORD_URL = 'https://beian.miit.gov.cn/';

export function IcpFooter() {
  if (!isH5Runtime()) {
    return null;
  }

  const openIcpRecord = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.open(ICP_RECORD_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <View className="icp-footer">
      <Text className="icp-footer__text" onClick={openIcpRecord}>
        粤ICP备2026008980号
      </Text>
    </View>
  );
}
