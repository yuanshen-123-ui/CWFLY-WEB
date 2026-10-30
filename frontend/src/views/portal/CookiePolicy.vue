<template>
  <div class="cookie-policy fade-in">
    <div class="cookie-policy__inner">
      <div class="page-header">
        <h1>Cookie 政策</h1>
        <p>CWFLY 的 Cookie 使用说明</p>
      </div>

      <div class="card p-lg mb-lg">
        <p class="text-secondary" style="line-height:1.8;"><strong>最后更新：</strong> 2026 年 7 月 20 日</p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">什么是 Cookie？</h3>
        <p class="text-secondary" style="line-height:1.8;">
          Cookie 是存储在您设备上的小型文本文件。当您访问网站时，Cookie 能帮助网站
          记住您的偏好设置，从而改善您的浏览体验。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">我们如何使用 Cookie</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          CWFLY 出于以下目的使用 Cookie：
        </p>

        <h4 class="mb-sm" style="color:var(--c-primary);">必要 Cookie</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          这些 Cookie 是网站正常运行所必需的。它们支持页面导航和访问安全区域等基本功能。
          没有这些 Cookie，网站将无法正常工作。
        </p>
        <div class="table-wrap mb-lg">
          <table v-sort>
            <thead>
              <tr><th>Cookie 名称</th><th>用途</th><th>有效期</th></tr>
            </thead>
            <tbody>
              <tr><td>session_id</td><td>维持用户会话状态</td><td>会话期间</td></tr>
              <tr><td>csrf_token</td><td>安全防护</td><td>会话期间</td></tr>
            </tbody>
          </table>
        </div>

        <h4 class="mb-sm" style="color:var(--c-primary);">功能 Cookie</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          这些 Cookie 使网站能够提供增强的功能和个性化设置。它们可能由我们设置，
          也可能由我们页面中使用的第三方服务商设置。
        </p>
        <div class="table-wrap mb-lg">
          <table v-sort>
            <thead>
              <tr><th>Cookie 名称</th><th>用途</th><th>有效期</th></tr>
            </thead>
            <tbody>
              <tr><td>language</td><td>记住语言偏好</td><td>1 年</td></tr>
              <tr><td>theme</td><td>记住显示偏好（主题）</td><td>1 年</td></tr>
            </tbody>
          </table>
        </div>

        <h4 class="mb-sm" style="color:var(--c-primary);">分析 Cookie</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          这些 Cookie 帮助我们了解访问者如何与网站互动，通过匿名收集和报告信息来改进我们的网站。
        </p>
        <div class="table-wrap mb-lg">
          <table v-sort>
            <thead>
              <tr><th>Cookie 名称</th><th>用途</th><th>有效期</th></tr>
            </thead>
            <tbody>
              <tr><td>_ga</td><td>Google Analytics - 区分用户</td><td>2 年</td></tr>
              <tr><td>_gid</td><td>Google Analytics - 区分用户</td><td>24 小时</td></tr>
              <tr><td>_gat</td><td>Google Analytics - 限制请求频率</td><td>1 分钟</td></tr>
            </tbody>
          </table>
        </div>

        <h4 class="mb-sm" style="color:var(--c-primary);">营销 Cookie</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          这些 Cookie 用于跨网站追踪访问者，目的是展示与个人用户相关的、有吸引力的广告。
        </p>
        <div class="table-wrap mb-lg">
          <table v-sort>
            <thead>
              <tr><th>Cookie 名称</th><th>用途</th><th>有效期</th></tr>
            </thead>
            <tbody>
              <tr><td>_fbp</td><td>Facebook Pixel 追踪</td><td>3 个月</td></tr>
              <tr><td>ads_session</td><td>广告偏好设置</td><td>会话期间</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">管理 Cookie</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          您可以通过以下方式控制和管理 Cookie：
        </p>

        <h4 class="mb-sm" style="color:var(--c-primary);">浏览器设置</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          大多数浏览器允许您：
        </p>
        <ul class="text-secondary mb-lg" style="line-height:2;padding-left:20px;">
          <li>查看设备上存储的 Cookie</li>
          <li>删除全部或特定 Cookie</li>
          <li>阻止来自全部或特定网站的 Cookie</li>
          <li>阻止第三方 Cookie</li>
        </ul>

        <h4 class="mb-sm" style="color:var(--c-primary);">Cookie 同意</h4>
        <p class="text-secondary mb-sm" style="line-height:1.6;font-size:14px;">
          首次访问本网站时，您将看到一个 Cookie 同意提示条。您可以选择：
        </p>
        <ul class="text-secondary mb-lg" style="line-height:2;padding-left:20px;">
          <li>接受所有 Cookie</li>
          <li>拒绝非必要 Cookie</li>
          <li>自定义 Cookie 偏好</li>
        </ul>

        <h4 class="mb-sm" style="color:var(--c-primary);">退出链接</h4>
        <ul class="text-secondary" style="line-height:2;padding-left:20px;">
          <li><a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google Analytics 退出工具</a></li>
          <li><a href="https://www.facebook.com/policies/cookies/" target="_blank" rel="noopener">Facebook Cookie 政策</a></li>
        </ul>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">禁用 Cookie 的影响</h3>
        <p class="text-secondary" style="line-height:1.8;">
          如果您禁用 Cookie，本网站的某些功能可能无法正常使用：
        </p>
        <ul class="text-secondary" style="line-height:2;padding-left:20px;">
          <li>您可能需要反复登录</li>
          <li>您的偏好设置可能无法保存</li>
          <li>部分交互功能可能无法工作</li>
        </ul>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">本政策的更新</h3>
        <p class="text-secondary" style="line-height:1.8;">
          我们可能会不时更新本 Cookie 政策。任何变更都将发布在此页面上，
          并附上更新后的修订日期。
        </p>
      </div>

      <div class="card p-lg">
        <h3 class="mb-md">联系我们</h3>
        <p class="text-secondary" style="line-height:1.8;">
          如果您对我们的 Cookie 使用有任何疑问，请通过以下方式联系我们：
        </p>
        <div class="flex gap-lg flex-wrap mt-md">
          <div><span class="text-muted">邮箱：</span> support@cwflysim.cn</div>
          <div><span class="text-muted">网站：</span> https://cwflysim.cn</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cookie-policy__inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px;
}
.cookie-policy :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.cookie-policy :deep(th),
.cookie-policy :deep(td) {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--c-border-light);
}
.cookie-policy :deep(th) {
  font-weight: 600;
  color: var(--c-text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.cookie-policy :deep(td) {
  color: var(--c-text);
}
.cookie-policy :deep(a) {
  color: var(--c-primary);
  text-decoration: none;
}
.cookie-policy :deep(a:hover) {
  text-decoration: underline;
}
</style>
