# 山水映帧（Shanshui Yingzhen）

![Platform](https://img.shields.io/badge/Platform-Windows-0078d6)
![Electron](https://img.shields.io/badge/Electron-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![FFmpeg](https://img.shields.io/badge/FFmpeg-9.0.1-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

面向 Windows 剪辑团队的本地批量视频转码桌面工具。应用使用 FFmpeg/ffprobe 完成媒体处理，**素材完全本地处理、不会上传**；通过独立离线授权中心签发绑定电脑的 Ed25519 注册码进行授权管理。

## 技术栈

- **Electron + Vite + React + TypeScript**（桌面壳与渲染层）
- **FFmpeg / ffprobe**（媒体解析与转码，发布包内置审核过的二进制）
- **Ed25519 离线授权**（授权中心签发绑定机器、客户、版本与到期日的注册码，主程序仅内置公钥）
- **tsup + electron-builder**（主进程构建与 Windows 安装包生成）
- **Vitest**（单元测试）；队列基于原子替换的本地 JSON 状态文件，无原生数据库依赖

## 当前功能

- 视频/音频文件拖放、批量导入、ffprobe 媒体分析；
- MP4 与 M3U8 两种输出格式，可选择原始分辨率、720p 或 1080p；
- 基于源文件码率的目标体积压缩，默认按约 1/8 总码率计算目标视频码率；MP4 使用 H.265，M3U8 使用兼容性更好的 H.264；
- 持久化任务队列、实时进度、任务取消、失败重试；
- 同卷临时文件、成功后原子改名、输出流与时长校验；
- FFmpeg/ffprobe 自定义路径和编码器能力检测；
- 独立注册机，支持机器绑定、客户名、TEAM/PRO 版本和到期日；
- 注册码由 Ed25519 私钥签名，主程序只包含公钥。

## 开发环境

需要 Node.js 22+、pnpm 10+，以及 FFmpeg/ffprobe。队列使用原子替换的本地 JSON 状态文件，因此不需要原生数据库依赖。

```powershell
pnpm install
pnpm license:keys
pnpm dev
```

发布安装包已内置经过审核的 `ffmpeg.exe` 与 `ffprobe.exe`，安装后可直接转码，不需要用户另行安装 FFmpeg。程序仍支持在“设置”中手动选择其他构建；开发版不会自动下载 FFmpeg。

压缩说明：程序根据源视频时长和码率估算目标码率，默认目标总码率约为源文件的 1/8。MP4 使用 H.265 `libx265`，M3U8 使用 H.264 `libx264`，两者均使用 slow preset、CRF 质量控制和码率上限，音频为 96 kbps AAC。实际体积会受画面复杂度、音频时长、封装和关键帧影响；对于本身已经高度压缩的低码率视频，无法在完全不损失质量的情况下再次缩小 8 倍。720p/1080p 是最大高度限制，源视频低于该高度时不会放大；原始分辨率模式不会执行缩放。

## 授权工作流

1. 首次执行且仅执行一次 `pnpm license:keys`。
2. `license-keys/license-private.pem` 是公司签发权限，必须从开发仓库和普通员工电脑隔离并备份。
3. `src/shared/license-public-key.ts` 会更新为公钥，它应正常打入主程序。
4. 启动主程序，复制激活页上的本机安装码。
5. 启动授权中心：`pnpm dev:keygen`。
6. 在授权中心选择私钥，填写安装码、客户/部门、版本和有效期，生成注册码。
7. 将注册码粘贴回目标电脑完成离线激活。

授权管理员需要批量签发时，也可以使用等价 CLI：

```powershell
pnpm license:issue --key=license-keys/license-private.pem --installation=XXXXX-XXXXX-XXXXX-XXXXX --customer=后期制作部 --edition=TEAM
```

生成发布包：

```powershell
pnpm package:app
pnpm package:keygen
```

输出位于 `release/app` 与 `release/keygen`。主软件包不包含私钥；注册机程序也不内嵌私钥，运行时由授权管理员选择。

## FFmpeg 发布要求

正式发布前必须确定产品开源/闭源策略，并审核 FFmpeg 的构建参数和全部第三方编码器。FFmpeg 默认主要使用 LGPL，但启用 GPL 组件（例如 libx264）后构建适用 GPL。不要把来源不明的 full build 直接放进安装包。

本项目的 Windows 安装包通过 `electron-builder.yml` 的 `extraResources` 将 `artifacts/ffmpeg-test/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe` 和 `ffprobe.exe` 放入安装包资源目录 `bin/`。正式对外发布前，应替换为公司审核并留档的固定构建，同时提供相应许可证、构建配置、源码获取方式和 SBOM。

## 安全边界

- 文件路径通过参数数组传给子进程，不经过 shell；
- 默认绝不覆盖已存在的输出或源文件；
- Windows 使用 DPAPI（Electron safeStorage）保护本机保存的注册码；
- 离线注册码能提高公司内部授权管理能力，但不能替代代码签名、完整性保护和商业级反篡改方案；
- Windows 安装包正式分发前应使用公司代码签名证书签名。

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm build
```

详细产品与技术背景见 [需求与可行性研究](./视频转码桌面工具-需求与可行性研究.md)。

## 项目结构

```
.
├── src/
│   ├── main/          # 主进程：FFmpeg 调用、任务队列、授权校验
│   ├── keygen/        # 授权中心主进程（签发注册码）
│   ├── preload/       # 预加载脚本
│   ├── renderer/      # React 界面（主工作台 / 授权中心）与样式
│   └── shared/        # 共享常量、类型与授权公钥（仅公钥入库）
├── scripts/           # 授权密钥生成与签发 CLI
├── electron-builder.yml          # 主程序安装包配置
├── electron-builder.keygen.yml   # 授权中心 portable 配置
├── vite.config.mts / tsup.config.ts
└── package.json
```

## 开源协议

本项目以 [MIT License](./LICENSE) 开源。

- 代码仓库**不包含**授权私钥与 FFmpeg 二进制（均已通过 `.gitignore` 排除）。
- 发布安装包内置的 FFmpeg 为第三方构建，其适用许可证（LGPL/GPL）请以最终发布产物为准，详见上文 [FFmpeg 发布要求](#ffmpeg-发布要求)。

## 联系开发者

欢迎学习与交流，有疑问或建议可联系：

- **QQ：472997749**
