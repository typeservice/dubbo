# @typeservice/dubbo

It is a service architecture based on dubbo. 

It uses inversify as a dependency injection prototype, and distributes parameters to methods via parameter annotations, which is very strong to decoupled. You can write methods as you wish, distributing them to different parameters via parameter annotations.

## Installing

For the latest stable version:

```bash
$ npm install @typeservice/dubbo
```

## Usage

```ts
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
  test(@rpc.Req.PARAMETER(0) args: any, @rpc.Req.ID id: number) {
    console.log(args);
    return id;
  }
}
const dubbo = new Dubbo<COMPONENTS>({
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
dubbo.bind('userinfo', UserInfo);
dubbo.listen();
```

# License

[MIT](http://opensource.org/licenses/MIT)

Copyright (c) 2019-present, yunjie (Evio) shen
