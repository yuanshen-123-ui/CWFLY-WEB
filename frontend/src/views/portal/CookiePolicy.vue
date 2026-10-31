<template>
  <div class="legal fade-in">
    <div class="legal__inner">
      <div class="page-header">
        <h1>Cookie 政策</h1>
        <p>关于 Cookie、localStorage 等本地存储技术在本站的使用说明</p>
      </div>

      <div class="card p-lg mb-lg legal__meta">
        <p class="text-secondary" style="line-height:1.8;margin:0;">
          <strong>最后更新：</strong>2026 年 10 月 31 日　
          <strong>生效日期：</strong>2026 年 10 月 31 日
        </p>
        <p class="text-sm text-muted mt-sm" style="margin:0;">
          相关文档：
          <router-link to="/user-agreement">用户协议</router-link>
          <span class="sep">·</span>
          <router-link to="/privacy-policy">隐私政策</router-link>
          <span class="sep">·</span>
          <span>Cookie 政策（本页）</span>
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">一、本页说明什么</h3>
        <p class="text-secondary" style="line-height:1.8;">
          本政策说明 CWFLY（青翼模拟飞行连飞平台，下称“我们”或“本站”）在
          <strong>cwflysim.cn</strong>（含 www 与 api 子域）及本站各功能页面中，
          如何使用 Cookie、localStorage 等浏览器本地存储技术，以及你可以如何管理它们。
          本政策是《隐私政策》的组成部分；两者不一致时，就个人信息处理事项以《隐私政策》为准。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">二、Cookie 与本地存储是什么</h3>
        <p class="text-secondary mb-sm" style="line-height:1.8;">
          <strong>Cookie</strong> 是网站存放在你浏览器中的小型文本文件，会在你再次访问时回传，用于保持状态。
          <strong>localStorage / sessionStorage</strong> 是浏览器提供的本地存储空间，只保存在你的设备上，
          不会被浏览器自动发送；只有当页面脚本读取时才起作用。
        </p>
        <p class="text-secondary" style="line-height:1.8;">
          本站的登录状态使用 <strong>JWT 凭证</strong>（保存在 localStorage，随请求头 Authorization 发送），
          <strong>不依赖登录会话 Cookie</strong>。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">三、本站使用的本地存储清单</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          本站当前使用的本地存储<strong>全部属于“严格必要”类别</strong>，用于登录、偏好记忆与安全防护：
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>名称</th><th>类型</th><th>用途</th><th>保存期限</th><th>不启用会怎样</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>cw_token</code></td><td>localStorage</td>
                <td>登录凭证（JWT），请求时通过 Authorization 头携带；活跃时自动续期</td>
                <td>6 小时（滑动续期），退出登录即清除</td><td>无法登录或登录后频繁掉线</td>
              </tr>
              <tr>
                <td><code>cw_user</code></td><td>localStorage</td>
                <td>缓存当前账号的公开资料（呼号 / 昵称 / 等级 / 权限），减少首屏请求</td>
                <td>与登录凭证一致，退出清除</td><td>首屏需重新拉取资料，功能仍可用</td>
              </tr>
              <tr>
                <td><code>cw_last_active</code></td><td>localStorage</td>
                <td>记录最近一次操作时间，用于判断登录是否过期、是否自动续期</td>
                <td>6 小时，退出清除</td><td>自动续期判断不准确</td>
              </tr>
              <tr>
                <td><code>cw_theme</code></td><td>localStorage</td>
                <td>显示主题偏好（跟随时间 / 浅色 / 深色）</td>
                <td>长期保存，直到你清除</td><td>切换页面后主题可能被重置</td>
              </tr>
              <tr>
                <td><code>cw_cookie_consent</code></td><td>localStorage</td>
                <td>记住你在 Cookie 提示条中的选择，避免重复弹出</td>
                <td>长期保存，直到你清除</td><td>每次访问都会再次提示</td>
              </tr>
              <tr>
                <td><code>cw_pet_config</code><br><code>cw_pet_enabled</code><br><code>cw_pet_phrases</code><br><code>cw_pet_pos</code></td>
                <td>localStorage</td>
                <td>桌面宠物挂件的开关、位置、自定义短语（仅保存在本机）</td>
                <td>长期保存，直到你清除</td><td>挂件设置不保存</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-muted mt-md" style="line-height:1.7;">
          上述数据均保存在你的浏览器中，我们不会通过它们做广告画像或跨站追踪。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">四、第三方组件（仅在特定页面加载）</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          以下第三方组件只在你访问对应页面时才会加载，它们可能按照自身规则写入 Cookie 或本地存储，
          具体处理规则以其官方政策为准：
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>提供方</th><th>出现页面</th><th>用途 / 可能写入的数据</th><th>官方政策</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>高德地图 JSAPI</td>
                <td>在线地图、机场与航图相关页面</td>
                <td>地图瓦片与交互；可能写入地图初始化相关的本地存储或 Cookie</td>
                <td><a href="https://lbs.amap.com/pages/privacy/" target="_blank" rel="noopener">高德开放平台隐私政策</a></td>
              </tr>
              <tr>
                <td>Mapbox GL JS</td>
                <td>在线地图 3D 视图</td>
                <td>地图渲染与视图偏好；可能写入本地存储</td>
                <td><a href="https://www.mapbox.com/legal/privacy/" target="_blank" rel="noopener">Mapbox 隐私政策</a></td>
              </tr>
              <tr>
                <td>OpenWeatherMap 瓦片</td>
                <td>在线地图（开启降水图层时）</td>
                <td>请求地图瓦片会携带所请求的坐标范围与 IP，不包含你的账号信息</td>
                <td><a href="https://openweathermap.org/privacy-policy" target="_blank" rel="noopener">OpenWeatherMap 隐私政策</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">五、设备指纹与访问记录（非 Cookie）</h3>
        <p class="text-secondary" style="line-height:1.8;">
          为防范批量注册、撞库、刷接口与封禁规避，本站会（1）在浏览器本地计算工作量证明（PoW，纯前端 SHA-256，不请求第三方）；（2）在你访问时生成一个<strong>设备指纹</strong>：
          由浏览器 User-Agent、语言、平台、CPU 线程数、设备内存、屏幕参数、时区、触点数量以及
          Canvas / WebGL 渲染特征汇总后哈希得到 8 位字符串。<strong>该指纹只在你当前页面会话的内存中计算，
          不写入 localStorage</strong>，随请求头 <code>X-Device-Fp</code> 发送到服务器，用于安全风控。
        </p>
        <p class="text-secondary mt-sm" style="line-height:1.8;">
          此外，页面加载时会请求 <code>/api/security/pixel.gif</code>，把设备指纹、来源页与
          IP（由服务器从连接中获取）记录为访问安全事件，用于分析与拦截异常访问。
          相关数据的处理目的、保存期限与你的权利请见
          <router-link to="/privacy-policy">《隐私政策》</router-link>。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">六、本站不做的事</h3>
        <ul class="text-secondary" style="line-height:2;padding-left:20px;">
          <li>不接入第三方广告平台，不投放定向广告，不进行跨网站行为追踪；</li>
          <li>当前未接入 Google Analytics、百度统计、友盟等第三方流量统计工具；</li>
          <li>不出售、不出租你的个人信息，也不用本地存储内容做商业画像。</li>
        </ul>
        <p class="text-sm text-muted mt-sm" style="line-height:1.7;">
          若未来启用新的非必要类别（例如统计类 Cookie），我们会在启用前更新本政策并重新征得你的同意。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">七、如何管理或清除</h3>
        <p class="text-secondary mb-sm" style="line-height:1.8;">
          <strong>站内方式：</strong>点击右上角头像 → 退出登录（清除登录凭证）；
          或在 Cookie 提示条中选择“仅必要 / 接受全部”，该选择只被记录在本地。
        </p>
        <p class="text-secondary mb-sm" style="line-height:1.8;">
          <strong>浏览器方式：</strong>主流浏览器均支持查看、删除、按站点屏蔽本地数据，
          通常在“设置 → 隐私与安全 → Cookie 和其他网站数据”中操作（Chrome / Edge / Firefox / Safari 类似）。
          使用无痕/隐私窗口时，关闭窗口即会清除本次会话的本地存储。
        </p>
        <p class="text-secondary" style="line-height:1.8;">
          <strong>禁用后的影响：</strong>本站的本地存储均属必要项，全部禁用后你将无法保持登录状态，
          主题、桌面宠物等偏好也不会保存；浏览公开页面不受影响。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">八、同意与撤回</h3>
        <p class="text-secondary" style="line-height:1.8;">
          首次访问时页面会显示 Cookie 提示条。由于本站当前仅使用必要类本地存储，
          “仅必要”与“接受全部”<strong>在功能上没有区别</strong>，两个选项都只是记录你的偏好，
          不会开启额外的统计或广告类追踪。
        </p>
        <p class="text-secondary mt-sm" style="line-height:1.8;">
          你可以随时清除 <code>cw_cookie_consent</code> 或本站全部站点数据来撤回选择，
          下次访问会重新提示；撤回不影响撤回前已进行的处理的合法性。
          如需就个人信息行使权利（查阅、更正、删除、注销等），请按《隐私政策》第九条操作。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">九、本政策的更新</h3>
        <p class="text-secondary" style="line-height:1.8;">
          我们可能因功能调整或法律要求更新本政策。更新后的版本会发布在本页面并更新“最后更新”日期；
          若变更会实质影响你的权利，我们还会通过站内公告、弹窗或邮件等方式提示。
          建议你定期查看本页面。
        </p>
      </div>

      <div class="card p-lg">
        <h3 class="mb-md">十、联系我们</h3>
        <p class="text-secondary" style="line-height:1.8;">
          如对本政策或本站的 Cookie 使用有疑问，可通过以下方式联系：
        </p>
        <div class="flex gap-lg flex-wrap mt-md">
          <div><span class="text-muted">邮箱：</span> support@cwflysim.cn</div>
          <div><span class="text-muted">QQ 群：</span> 868785291</div>
          <div><span class="text-muted">网站：</span> https://www.cwflysim.cn</div>
        </div>
        <p class="text-sm text-muted mt-md" style="line-height:1.7;">
          我们通常在 15 个工作日内回复。涉及个人信息权利的请求，请尽量使用注册邮箱发送，以便核验身份。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal__inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px;
}
.legal__meta a,
.legal :deep(a) {
  color: var(--c-primary);
  text-decoration: none;
}
.legal__meta a:hover,
.legal :deep(a:hover) {
  text-decoration: underline;
}
.legal .sep {
  margin: 0 6px;
  color: var(--c-text-muted);
}
.legal :deep(h4) {
  color: var(--c-primary);
}
.legal :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.legal :deep(th),
.legal :deep(td) {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--c-border-light);
  vertical-align: top;
  line-height: 1.6;
}
.legal :deep(th) {
  font-weight: 600;
  color: var(--c-text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.legal :deep(td) {
  color: var(--c-text);
}
.legal :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--c-bg-soft, rgba(127, 127, 127, 0.12));
  font-size: 13px;
}
</style>
