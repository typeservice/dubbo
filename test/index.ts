import Dubbo, { rpc } from '../src';
import { injectable } from 'inversify';

type COMPONENTS = {
  userinfo: UserInfo,
}

@injectable()
@rpc.Interface('com.mifa.stib.service.TestUserInfo')
@rpc.Version('2.0.0')
@rpc.Description('测试演示')
class UserInfo {
  @rpc.Method
  @rpc.Swagger.Summary('测试')
  @rpc.Swagger.Request({
    $class: 'com.mifa.stib.common.RpcData',
    $schema: {
      type: 'object',
      properties: {
        headers: {
          type: 'object',
          description: '头部公共数据',
          properties: {
            appName: {
              type: 'string',
              description: '应用别名'
            },
            platform: {
              type: 'integer',
              description: '程序平台类型'
            },
            equipment: {
              type: 'integer',
              description: '设备类型'
            },
            trace: {
              type: 'string',
              description: '请求链路跟踪ID'
            },
            userToken: {
              type: 'string',
              description: '用户登录有效Token'
            },
            channelType: {
              type: 'string',
              description: '请求来源于哪里。如果是网关，约定为gateway；如果是微服务，约定为rpc。'
            },
            channelMethod: {
              type: 'string',
              description: '请求来源的方法，这里单指从网关来的http方法名 get post put delete head中的一个。'
            }
          },
          required: [
            'appName',
            'platform',
            'equipment',
            'trace',
            'channelType'
          ]
        },
        data: {
          type: 'string'
        },
        user: {
          type: 'integer',
          description: '用户关系ID'
        }
      },
      required: ['headers', 'user']
    }
  })
  test(@rpc.ctx.param(0) args: any, @rpc.ctx.id id: number) {
    return id;
  }
}

const dubbo = new Dubbo({
  provider: {
    application: 'stib.test',
    dubbo_version: '2.0.2',
    port: 8080,
  },
  registry: {
    host: '192.168.2.150:2181'
  },
  swagger: 'stib'
});

dubbo.bind<COMPONENTS['userinfo']>('userinfo', UserInfo);

dubbo.listen();