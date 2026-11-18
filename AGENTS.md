# 项目约定

先读 README.md、docs/工程结构说明.md 及与任务相关的规则文档。本机若存在已忽略的 docs/项目交接说明.md，可用于恢复历史上下文；按用户最新指令及当前磁盘状态继续，不将历史待办视为自动发布授权。

本工程是个人主体小程序的比赛模拟平台，不接真实药品交易、实际仓储或运输业务。页面始终说明模拟用途，不把日志称为区块链存证，不把手动录入或模拟曲线称为实测数据。

原生小程序目录为 miniprogram，业务规则集中在 miniprogram/core/domain.js。服务端复用同一规则，避免手机与后端计算不一致。改调度逻辑后运行 npm test 和 npm run check。

工程根目录及miniprogramRoot保持稳定。原始方案、品牌源文件和本机资源不属于公开仓库。可复用开发脚本放scripts；编译结果、HTML布局预览、截图、浏览器配置分别放artifacts/build、previews、screenshots、cache。生成物不提交Git，预览脚本不可只保存在artifacts中。

本机执行 npm run compile:wechat 验证微信模板和样式；npm run preview:layout 自动编译后生成布局检查入口。不要把HTML预览称为微信真机或正式审核结果。

公开配置为 project.config.example.json。执行 npm run setup:wechat 创建本机 project.config.json；初始化不得覆盖已有配置。真实 AppID 只保存在已忽略的本机配置中，不修改已有项目身份。AppSecret 只能留在服务端环境变量中，不复制其他项目凭据。

当前默认本地模拟模式。远程部署使用独立服务目录、数据、运行时、端口、域名与访问码，不能覆盖其他业务。本地可随时开发和验证；正式发布必须按用户授权执行，并如实记录实际结果。

公开提交前运行 npm run check:publication 检查 Git 暂存内容。个人路径、应用身份、真实服务地址、凭据、运行数据与内部交接记录不得进入提交；提交作者使用项目贡献者身份。
