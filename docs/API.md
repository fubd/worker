# 雨燕 API

生产入口：`https://api.deephos.com/api`。站点通过 `https://deephos.com/api/*` 同源转发到该入口。

## 通用约定

- 除健康检查、认证入口和只读分享外，接口都要求有效的 `yuyan_session` Cookie。
- 请求和响应使用 JSON；附件上传使用 `multipart/form-data`。
- 错误响应统一为 `{ "error": "可读错误信息" }`。
- 文档、分组和附件 ID 都是 24 位不透明字符串，不能当作自增 ID 使用。
- 未认证请求返回 `401`；资源不存在或不属于当前用户返回 `404`；版本冲突返回 `409`；限流返回 `429`。
- 写请求受每用户限流。响应被限流时会带 `Retry-After` 秒数。
- `Server-Timing` 会记录 D1 等关键阶段耗时。

## 健康检查

| 方法  | 路径             | 说明                           |
| ----- | ---------------- | ------------------------------ |
| `GET` | `/api/health`    | Worker 存活、运行环境和时间    |
| `GET` | `/api/health/db` | 执行 `SELECT 1` 验证 D1 可用性 |

## 认证

| 方法   | 路径                       | 说明                     |
| ------ | -------------------------- | ------------------------ |
| `GET`  | `/api/auth/google`         | Google OAuth 登录或绑定  |
| `GET`  | `/api/auth/github`         | GitHub OAuth 登录或绑定  |
| `GET`  | `/api/auth/me`             | 当前会话和已绑定登录方式 |
| `POST` | `/api/auth/register`       | 账号名和密码注册         |
| `POST` | `/api/auth/password/login` | 账号名或已验证邮箱登录   |
| `PUT`  | `/api/auth/password`       | 设置或修改密码           |
| `POST` | `/api/auth/logout`         | 注销当前会话             |

注册请求：

```json
{
  "username": "yuyan_writer",
  "password": "at-least-10-characters"
}
```

账号恢复限制：

- 账号名和密码没有邮件验证码或邮件重置入口。
- 已绑定 Google 或 GitHub 时，使用可信服务商重新登录。
- 未绑定可信身份且忘记密码时，无法自动证明账号所有权，因此不支持自动恢复。
- 修改密码后会撤销该账号的其他会话。

## 文档列表与分页

`GET /api/documents`

查询参数：

| 参数         | 说明                              |
| ------------ | --------------------------------- |
| `folder`     | 分组公开 ID；`unfiled` 表示未归档 |
| `q`          | 标题和正文搜索，最多 100 个字符   |
| `favorite=1` | 只返回收藏                        |
| `recent=1`   | 只返回最近浏览                    |
| `limit`      | 每页数量，默认 50，最大 100       |
| `cursor`     | 上一页返回的 `nextCursor`         |

响应：

```json
{
  "items": [],
  "nextCursor": "base64url-cursor"
}
```

`nextCursor` 为 `null` 表示已到末页。游标绑定当前排序位置，不能在更换分组、搜索词或视图后复用。

`GET /api/documents/trash` 使用相同分页结构，只返回回收站文档。

## 文档

| 方法     | 路径                           | 说明                        |
| -------- | ------------------------------ | --------------------------- |
| `GET`    | `/api/documents/:id`           | 读取文档并更新最近浏览时间  |
| `POST`   | `/api/documents`               | 新建文档                    |
| `POST`   | `/api/documents/import`        | 导入完整正文                |
| `PATCH`  | `/api/documents/:id`           | 使用 `version` 乐观并发保存 |
| `DELETE` | `/api/documents/:id`           | 移入回收站                  |
| `POST`   | `/api/documents/:id/restore`   | 从回收站恢复                |
| `DELETE` | `/api/documents/:id/permanent` | 永久删除回收站文档          |
| `POST`   | `/api/documents/:id/duplicate` | 创建副本                    |
| `GET`    | `/api/documents/:id/children`  | 读取直属子文档              |
| `PATCH`  | `/api/documents/:id/folder`    | 移动文档                    |
| `PATCH`  | `/api/documents/:id/favorite`  | 设置收藏                    |
| `PATCH`  | `/api/documents/:id/pin`       | 设置置顶                    |
| `PATCH`  | `/api/documents/:id/share`     | 创建或停止只读分享          |
| `POST`   | `/api/documents/batch`         | 批量移动、收藏、删除或恢复  |

保存请求必须带当前版本：

```json
{
  "version": 7,
  "title": "新的标题",
  "content": { "type": "doc", "content": [] },
  "contentHtml": "<p></p>",
  "contentText": ""
}
```

版本不一致时返回 `409` 和 `currentVersion`。永久删除只接受已移入回收站的文档，并同时删除历史版本、附件元数据和 R2 对象。

## 文档版本

| 方法   | 路径                                           | 说明         |
| ------ | ---------------------------------------------- | ------------ |
| `GET`  | `/api/documents/:id/versions`                  | 历史版本列表 |
| `GET`  | `/api/documents/:id/versions/:version`         | 单个历史版本 |
| `POST` | `/api/documents/:id/versions`                  | 创建检查点   |
| `POST` | `/api/documents/:id/versions/:version/restore` | 恢复历史版本 |

## 分组

| 方法     | 路径                    | 说明                         |
| -------- | ----------------------- | ---------------------------- |
| `GET`    | `/api/folders`          | 分组树和直属文档计数         |
| `POST`   | `/api/folders`          | 新建分组                     |
| `PATCH`  | `/api/folders/:id`      | 改名                         |
| `PATCH`  | `/api/folders/:id/move` | 移动分组                     |
| `DELETE` | `/api/folders/:id`      | 递归删除分组，文档移到未归档 |

分组和文档共同组成侧栏目录。`GET /api/documents` 只返回当前层级的根文档，直属子文档通过
`GET /api/documents/:id/children` 读取。新建子文档时传入父文档的 `parentId`；移动文档时，
`PATCH /api/documents/:id/folder` 同时接受 `folderId` 和 `parentId`，`parentId: null`
表示移动到该分组的当前层级。子文档必须与父文档位于同一分组；移动到自身或自己的子文档会返回
`409`。

## 附件

| 方法     | 路径                                                    | 说明     |
| -------- | ------------------------------------------------------- | -------- |
| `GET`    | `/api/documents/:id/attachments`                        | 附件列表 |
| `POST`   | `/api/documents/:id/attachments`                        | 上传附件 |
| `GET`    | `/api/documents/:id/attachments/:attachmentId/download` | 下载附件 |
| `DELETE` | `/api/documents/:id/attachments/:attachmentId`          | 删除附件 |

单个附件最大 10 MB；每篇文档最多 20 个附件；每个账号最多 200 MB 附件。

## 只读分享

`GET /api/shares/:shareId` 返回公开只读正文。该接口不要求登录，但按客户端 IP 限流。

## 当前配额与限流

| 项目                 | 上限                |
| -------------------- | ------------------- |
| 每用户文档总数       | 1,000               |
| 每文档附件数         | 20                  |
| 每用户附件容量       | 200 MB              |
| 普通读请求           | 每用户每分钟 600 次 |
| 普通写请求           | 每用户每分钟 120 次 |
| 新建、导入、复制文档 | 每用户每分钟 60 次  |
| 附件上传             | 每用户每分钟 20 次  |
| 公开分享读取         | 每 IP 每分钟 120 次 |

回收站中的文档仍占用文档配额，永久删除后释放。
