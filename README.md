# AI_rule_for_surge

Claude、OpenAI、Google AI 等服务的 Surge 域名分流清单。同一份 `.list` 同时用于流量分流和按域名选择加密 DNS，新增域名时只维护一处。

本仓库仅包含公开服务域名和配置示例，不包含代理节点、订阅链接、访问令牌、Cookie、密码或证书。不要把完整个人 Surge 配置上传到公开仓库。

## 规则文件

| 文件 | 范围 |
| --- | --- |
| [Claude.list](rules/Claude.list) | Claude、Anthropic 及对应日志域名 |
| [OpenAI.list](rules/OpenAI.list) | OpenAI、ChatGPT、Codex、Sora 及部分专用资源 |
| [GoogleAI.list](rules/GoogleAI.list) | Gemini、AI Studio、NotebookLM、Antigravity 及相关登录/API |
| [AIShared.list](rules/AIShared.list) | 登录、验证、支付、客服和统计等共享依赖 |
| [OtherAI.list](rules/OtherAI.list) | 其他已纳入清单的 AI 服务 |

这些清单不是各厂商全部域名的官方完整列表。`AIShared.list` 中的服务也可能被其他应用使用，匹配它们会影响这些应用对相同域名的访问。Google 登录域名同样不只用于 AI。

## 流量分流

将下面五条规则放在 Google 通用规则、Proxy 通用规则、国内规则和 FINAL 之前。所引用的五个策略组须已存在，或改成自己的策略名称。

```ini
[Rule]
RULE-SET,https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/Claude.list,"🟠 Claude专用",extended-matching
RULE-SET,https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/GoogleAI.list,"🔎 Google专用",extended-matching
RULE-SET,https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/OpenAI.list,"🤖 OpenAI专用",extended-matching
RULE-SET,https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/AIShared.list,"🧩 AI共享依赖",extended-matching
RULE-SET,https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/OtherAI.list,"📟 AI服务",extended-matching
```

`extended-matching` 让规则集也能按 TLS SNI 等信息匹配，覆盖应用先解析成 IPv4/IPv6 地址再连接的情况。它不代表没有 SNI 的任意 IP 连接都能识别成对应服务。

不要同时保留原来相同的逐条 AI 域名规则，否则会产生重复维护。已有的进程规则应根据原有优先级单独保留，例如 Antigravity 的 `language_server` 进程规则；进程规则不能用来决定 DNS 查询属于哪个应用。

## AI 域名的加密 DNS

下面的示例让清单内的域名使用 Cloudflare DoH，并通过 `DNS代理` 策略发送 DNS 请求；其余域名继续使用原来的阿里 DoH。将内容合并到已有区段，不要直接替换完整配置。

```ini
[General]
encrypted-dns-follow-outbound-mode = true
# 已有默认 DNS 若不是阿里，请保留原值并相应调整下方直连规则。
encrypted-dns-server = https://dns.alidns.com/dns-query

[Proxy Group]
# 示例复用已有 Google 专用组；也可选择其他能正常访问 Cloudflare 的代理。
DNS代理 = select, "🔎 Google专用"

[Rule]
# 这两条应位于所有可能触发 DNS 查询的通用规则之前，避免解析依赖循环。
AND,((PROTOCOL,DOH),(IP-CIDR,1.1.1.1/32,no-resolve)),DNS代理
AND,((PROTOCOL,DOH),(DOMAIN,dns.alidns.com)),DIRECT

[Host]
RULE-SET:https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/Claude.list = server:https://1.1.1.1/dns-query
RULE-SET:https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/GoogleAI.list = server:https://1.1.1.1/dns-query
RULE-SET:https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/OpenAI.list = server:https://1.1.1.1/dns-query
RULE-SET:https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/AIShared.list = server:https://1.1.1.1/dns-query
RULE-SET:https://raw.githubusercontent.com/unicom2zero/AI_rule_for_surge/main/rules/OtherAI.list = server:https://1.1.1.1/dns-query
```

保留已有局域网、NAS 等 `[Host]` 映射，并将需要优先匹配的例外放在这些规则集映射之前。此配置不固定 AI 服务 IP，也不改动全局 IPv6、MITM、远程控制接口或 FINAL。

DNS 代理必须能独立建立连接：若代理服务器使用域名，需确保该域名能通过不依赖此代理的 DNS 解析。使用 `1.1.1.1` 作为 DoH 服务地址，可以避免先解析 DoH 主机名的依赖；仍须保留证书验证。

`[Host]` 的 `server:` 项指定的是 Surge 本地解析时的服务器，不会强制所有代理协议把远端域名解析也改用这个服务器。不要将它理解为代理服务器自身的 DNS 配置。

如果 DNS 代理不可用，清单内域名可能解析失败；未添加自动退回直连 DNS，以免重新引入错误解析。

## 新增和更新域名

只编辑对应的 `rules/*.list`，每行一个规则，不写策略名或 `extended-matching`：

```ini
# 仅匹配这个主机名
DOMAIN,api.example.com
# 匹配 example.com 及其子域名
DOMAIN-SUFFIX,example.com
```

提交到 `main` 后，在 Surge 中更新外部资源，并确认流量规则和 DNS 映射均使用最新内容。两处引用的缓存刷新不应被当成事务式同步；GitHub Raw 也可能短时缓存旧内容。清单变化后重新执行解析和分流检查。

不要用过宽的关键词、整个云厂商网段或共享 ASN 代替明确域名。共享 IP 可能服务于多个无关网站；只按 IP 强制分流会扩大影响范围。

## 验证和兼容性

基线验证平台为 Surge Mac 6.12.0。五份清单保留原配置的 90 条域名规则，替换前后应检查：

1. 域名请求与 IPv4/IPv6 地址加 SNI 的请求均命中正确策略。
2. ChatGPT、OpenAI API、Claude API、Google AI 的本地解析使用 Cloudflare DoH。
3. 百度、腾讯等未纳入清单的国内域名仍使用原来的 DNS；NAS 映射保持不变。
4. 真实登录、对话、上传和实时连接按实际需要单独验证；HTTP HEAD 成功不等于全部业务成功。

官方文档将 `[Host]` 引用规则集功能标注为 Mac 5.10.0+。iPhone 上的具体版本须实际校验、刷新外部资源并测试，不将 Mac 测试结果视为 iOS 验收通过。

公开 Raw 文件须能被设备读取；不要把 GitHub 私有仓库令牌写进配置或 URL。网络分流及 DNS 配置不改变服务的账号、地区和使用政策要求，也不保证不会触发风控。

## 官方参考

- [本地 DNS 映射与规则集引用](https://manual.nssurge.com/dns/local-dns-mapping.html)
- [规则集与 extended-matching](https://manual.nssurge.com/rules/ruleset.html)
- [General 配置与加密 DNS 出站开关](https://manual.nssurge.com/profile/general.html)
