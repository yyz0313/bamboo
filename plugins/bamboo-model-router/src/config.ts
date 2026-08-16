// config.ts
// failover provider 的配置类型

export interface FailoverBackend {
  /** 已加载的真实 provider 路由,例如 deepseek-official / openai / acme-gateway */
  provider: string
  /** 该 provider 上实际使用的模型 wire name */
  model: string
  /** 描述标签（用于 UI 展示，可选） */
  label?: string
  /** 专用 API Key 环境变量名（可选，不填则用 DSH 全局凭证） */
  credentialEnvKey?: string
}

export interface FailoverConfig {
  /** 对外暴露的单一 provider 路由名 */
  route: string
  /** 按优先级排序的后端列表(前者优先) */
  backends: FailoverBackend[]
  /**
   * 是否允许首 token 之后靠整轮重试切换。
   * buffered 模式下此参数影响较小（因为中间失败会丢弃 buffer 换后端）。
   */
  allowStepRetry?: boolean
  /**
   * Buffer 策略：
   *   'strict'（默认）：所有 chunk 缓存在内存，成功后一次性 flush，中途失败则丢弃并换后端。
   *                     用户永远看到完整响应，代价是几十毫秒延迟。
   *   'hybrid'：前 N 个 chunk 缓存（warmup），之后实时 yield。
   *              延迟更低，但 warmup 后失败时用户可能已看到残缺内容。
   *   'stream'：完全不缓存，失败只能靠 allowStepRetry 交给上层整轮重试。
   *              最低延迟，但无法中途切换。
   */
  bufferMode?: 'strict' | 'hybrid' | 'stream'
  /** hybrid 模式下的 warmup chunk 数量（默认 3） */
  warmupChunks?: number
  /** buffer 最大 chunk 数，防止内存无限增长（默认 1000） */
  maxBufferedChunks?: number
  /** 日志级别 */
  logLevel?: 'silent' | 'normal' | 'verbose'
}
