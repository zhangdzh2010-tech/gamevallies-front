import { View, Text } from '@tarojs/components';
import { isH5Runtime } from '../../utils/runtime';
import './IcpFooter.scss';

export function IcpFooter() {
  if (!isH5Runtime()) {
    return null;
  }

  return (
    <View className="icp-footer">
      <Text className="icp-footer__text">粤ICP备2026008980号</Text>
    </View>
  );
}
