<template>
  <div class="legal fade-in">
    <div class="legal__inner">
      <div class="page-header">
        <h1>隐私政策</h1>
        <p>CWFLY 如何收集、使用、存储与保护你的个人信息</p>
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
          <span>隐私政策（本页）</span>
          <span class="sep">·</span>
          <router-link to="/cookie-policy">Cookie 政策</router-link>
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">一、引言与适用范围</h3>
        <p class="text-secondary" style="line-height:1.8;">
          CWFLY（青翼模拟飞行连飞平台，下称“我们”或“本站”）是一个面向模拟飞行爱好者的
          连飞与社区平台。我们依据《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》
          《中华人民共和国数据安全法》等法律法规处理你的个人信息，并遵循合法、正当、必要与诚信原则，
          做到目的明确、最小必要、公开透明。
        </p>
        <p class="text-secondary mt-sm" style="line-height:1.8;">
          本政策适用于 <strong>cwflysim.cn</strong>（含 www、api 子域）以及我们运营的
          <strong>atc.cwflysim.cn</strong>（ATC 模拟机中心）。第三方网站（例如地图、邮件、人机校验服务商）
          有自己的隐私政策，不适用本政策。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">二、我们收集哪些信息</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          我们只收集实现功能与保障安全所必需的信息，分类如下：
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>类别</th><th>具体信息</th><th>来源</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>账号信息</td>
                <td>CID（连飞编号）、用户名 / 呼号、邮箱、密码哈希（bcrypt，不保存明文）、QQ 号（选填）、头像、主页背景图、等级与权限、累计飞行 / 管制时长、注册时间</td>
                <td>你主动填写或上传</td>
              </tr>
              <tr>
                <td>注册与安全核验</td>
                <td>注册 IP、注册浏览器 UA、注册设备指纹；登录日志（IP、UA、粗略归属地、成功 / 失败、失败原因、设备指纹）；安全事件（访问路径、来源页、IP、国家 / 城市、网络类型、设备指纹、是否被拦截）；访问聚合（IP、访问次数、首次 / 最近访问时间、设备指纹）</td>
                <td>你访问时由服务器自动记录</td>
              </tr>
              <tr>
                <td>飞行与管制</td>
                <td>飞行计划（呼号、机型、起降机场、时间、航路、备降、备注）、在线状态（呼号、最后在线时间）、航迹记录、管制排班 / 席位信息</td>
                <td>你主动提交或连飞时产生</td>
              </tr>
              <tr>
                <td>社区互动</td>
                <td>论坛帖子 / 回复、活动报名（呼号、机型、席位、频率）、培训课程与考试成绩、积分与成就、工单 / 反馈、申请与审批、签到记录、通知</td>
                <td>你主动提交</td>
              </tr>
              <tr>
                <td>邮件与验证</td>
                <td>验证码（10 分钟内有效）、邮件发送记录（收件地址、主题、类型、状态、错误信息）</td>
                <td>你请求验证 / 通知时产生</td>
              </tr>
              <tr>
                <td>设备指纹信号</td>
                <td>User-Agent、语言、平台、CPU 线程数、设备内存、屏幕分辨率 / 色深 / 像素比、时区、触点数量、Canvas / WebGL 渲染特征；汇总后仅得到 8 位哈希，<strong>原始信号不在服务端留存</strong></td>
                <td>浏览器自动提供</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-muted mt-md" style="line-height:1.7;">
          <strong>我们不收集：</strong>身份证件号码、人脸 / 指纹等生物识别信息、精确 GPS 位置、
          通讯录、短信内容、银行卡与支付信息（如未来涉及付费服务，将单独告知并征得同意）。
          活动报名也不需要填写真实姓名与手机号。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">三、处理目的与法律依据</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>目的</th><th>涉及信息</th><th>法律依据</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>注册、登录、提供连飞 / 飞行计划 / 社区 / 培训等功能</td>
                <td>账号信息、飞行与管制、社区互动</td>
                <td>履行你与我们之间的服务协议（《用户协议》）</td>
              </tr>
              <tr>
                <td>账号与站点安全：防撞库、防批量注册、防刷接口、封禁规避与地域访问限制</td>
                <td>登录日志、安全事件、设备指纹、IP、访问聚合、封禁记录</td>
                <td>我们的正当利益 + 履行网络安全法规定的日志留存等法定义务</td>
              </tr>
              <tr>
                <td>邮件验证码、账号通知、活动与系统公告</td>
                <td>邮箱、验证码、邮件记录</td>
                <td>履行服务协议所必需</td>
              </tr>
              <tr>
                <td>故障排查、访问量统计与产品改进（仅使用聚合数据）</td>
                <td>访问聚合、错误日志</td>
                <td>我们的正当利益（不用于广告画像）</td>
              </tr>
              <tr>
                <td>依法配合监管机关、司法机关的调查与取证</td>
                <td>法律法规要求范围内的信息</td>
                <td>履行法定义务</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">四、Cookie 与本地存储</h3>
        <p class="text-secondary" style="line-height:1.8;">
          本站使用 localStorage 保存登录凭证与偏好设置，不使用广告或第三方统计 Cookie；防滥用采用浏览器本地计算的工作量证明（PoW），不引入第三方人机验证服务；
          设备指纹只存在于页面内存。完整的存储清单、第三方组件与管理方式见
          <router-link to="/cookie-policy">《Cookie 政策》</router-link>。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">五、委托处理、共享与对外提供</h3>
        <p class="text-secondary mb-md" style="line-height:1.8;">
          我们不会出售或出租你的个人信息。为实现功能，我们会与下列服务商合作，
          并在必要范围内共享信息：
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>接收方类型</th><th>目的</th><th>涉及信息</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>邮件推送服务商（SMTP）</td>
                <td>发送验证码、找回密码、账号通知</td>
                <td>你的邮箱地址、邮件主题与正文</td>
              </tr>
              <tr>
                <td>高德地图、Mapbox、OpenWeatherMap</td>
                <td>地图展示与气象图层渲染</td>
                <td>IP、地图瓦片请求的坐标范围（不含账号信息）</td>
              </tr>
              <tr>
                <td>云服务器与备份服务商</td>
                <td>站点运行、数据存储与容灾备份</td>
                <td>本政策第二条所列各类数据</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-secondary mt-md" style="line-height:1.8;">
          除上述情形外，只有在取得你的单独同意、或依据法律法规及主管机关强制要求时，
          我们才会对外提供你的个人信息。发生合并、分立或资产转让时，
          我们会要求承继方继续受本政策约束，否则将重新征得你的同意。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">六、存储地点与跨境传输</h3>
        <p class="text-secondary" style="line-height:1.8;">
          本站服务器与备份目前部署在<strong>中华人民共和国香港特别行政区</strong>，
          对境内用户而言属于向境外提供个人信息的情形。我们会依法履行告知义务，
          并在需要时取得你的单独同意，或采取签订标准合同、开展个人信息保护影响评估等法律要求的措施，
          并监督接收方按照本政策与法律规定处理信息。
        </p>
        <p class="text-secondary mt-sm" style="line-height:1.8;">
          你可以通过第十二条的联系方式，向我们索取当前境外接收方的名称、联系方式、
          处理目的与方式、信息种类以及你向其行使权利的方式。若你不同意信息出境，
          请停止使用本服务并可申请删除已提供的信息。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">七、存储期限</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>信息类型</th><th>保存期限</th></tr>
            </thead>
            <tbody>
              <tr><td>账号信息、飞行与管制记录、社区内容、积分与成就</td><td>账号存续期间保存；账号注销后删除或匿名化处理</td></tr>
              <tr><td>安全事件记录（SecurityEvent）</td><td>默认 30 天（可按运维需要配置），到期自动清理</td></tr>
              <tr><td>登录尝试记录（LoginAttempt）</td><td>24 小时</td></tr>
              <tr><td>登录日志、操作审计日志、访问聚合（IpVisit）</td><td>账号存续期间保留用于安全审计；超出必要期限或经你申请后删除或匿名化</td></tr>
              <tr><td>邮箱验证码</td><td>10 分钟</td></tr>
              <tr><td>邮件发送记录</td><td>用于排障与审计，随账号存续期间保留</td></tr>
              <tr><td>数据库备份</td><td>30 天滚动覆盖</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-muted mt-md" style="line-height:1.7;">
          法律法规另有强制留存要求的（例如网络安全法对网络日志的要求），
          我们会在法定期限内保存，并在期限届满后删除或匿名化。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">八、我们如何保护信息</h3>
        <ul class="text-secondary" style="line-height:2;padding-left:20px;">
          <li>密码使用 bcrypt 加盐哈希存储，任何工作人员都无法查看你的明文密码；</li>
          <li>登录凭证采用 JWT，有效期 6 小时并在活跃时滑动续期，签名密钥按天轮换；</li>
          <li>全站 HTTPS 传输，接口按 IP / 账号 / 设备维度限流，并对异常登录与访问进行记录与拦截；</li>
          <li>管理员操作留存审计日志，权限按角色最小化分配；</li>
          <li>定期备份并限制备份文件访问权限；发现安全事件时按法律要求及时告知你并向主管部门报告。</li>
        </ul>
        <p class="text-sm text-muted mt-sm" style="line-height:1.7;">
          互联网环境无法保证绝对安全。请妥善保管账号密码，不要与他人共用账号；
          如发现账号异常请立即修改密码并联系我们。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">九、你的权利</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>权利</th><th>如何行使</th></tr>
            </thead>
            <tbody>
              <tr><td>查阅、复制</td><td>登录后可在“个人资料 / 我的记录”页面查看；需要完整副本可发邮件申请</td></tr>
              <tr><td>更正、补充</td><td>在个人资料页自行修改；呼号 / 邮箱等受限字段可提交工单或邮件申请</td></tr>
              <tr><td>删除</td><td>对特定内容（帖子、回复、工单等）可自行删除；其他信息可邮件申请删除</td></tr>
              <tr><td>撤回同意</td><td>可通过清除本地存储、关闭可选功能或邮件申请撤回；撤回不影响此前处理的合法性</td></tr>
              <tr><td>注销账号</td><td>发送邮件至 support@cwflysim.cn，使用注册邮箱并说明诉求；核验身份后 15 个工作日内处理</td></tr>
              <tr><td>解释说明与投诉</td><td>可要求我们说明个人信息处理规则；对处理结果不满可向监管部门投诉</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-secondary mt-md" style="line-height:1.8;">
          我们通常在收到请求并核验身份后 <strong>15 个工作日内</strong>答复。
          对于无端重复、超出必要限度、可能损害他人合法权益或技术上无法实现的请求，
          我们可能拒绝并说明理由。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">十、未成年人保护</h3>
        <p class="text-secondary" style="line-height:1.8;">
          本站面向模拟飞行爱好者，不专门面向儿童设计。未满 14 周岁的未成年人使用本站，
          应事先取得父母或其他监护人的同意，并在其指导下使用；未满 18 周岁的未成年人
          建议在监护人知情的情况下使用。若我们发现未经监护人同意收集了不满 14 周岁未成年人的
          个人信息，会尽快删除相关数据。监护人可通过第十二条联系方式与我们联系。
        </p>
      </div>

      <div class="card p-lg mb-lg">
        <h3 class="mb-md">十一、本政策的更新</h3>
        <p class="text-secondary" style="line-height:1.8;">
          功能调整或法律要求变化时，我们可能更新本政策。更新后的版本会发布在本页面并更新日期；
          涉及处理目的、信息种类、共享对象或你的权利等重大变更时，我们会通过站内公告、
          弹窗或邮件等方式另行提示，必要时重新征得你的同意。
        </p>
      </div>

      <div class="card p-lg">
        <h3 class="mb-md">十二、联系我们</h3>
        <p class="text-secondary" style="line-height:1.8;">
          个人信息处理者：CWFLY 模拟飞行社区运营团队。<br>
          如对本政策有任何疑问、意见或请求，请联系：
        </p>
        <div class="flex gap-lg flex-wrap mt-md">
          <div><span class="text-muted">邮箱：</span> support@cwflysim.cn</div>
          <div><span class="text-muted">QQ 群：</span> 868785291</div>
          <div><span class="text-muted">网站：</span> https://www.cwflysim.cn</div>
        </div>
        <p class="text-sm text-muted mt-md" style="line-height:1.7;">
          为保障安全，我们可能先核验你的身份（例如通过注册邮箱回信确认），再处理相关请求。
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
