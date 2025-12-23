// src/index_direct_hook.ts - 直接钩子用户创建
import { Context, Handler, PRIV, db } from 'hydrooj';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ObjectId } from 'mongodb';

export const name = 'welcome-direct-hook';

// 发送欢迎消息函数
async function sendWelcomeMessage(uid: number): Promise<void> {
    try {
        const user = await db.collection('user').findOne(
            { _id: uid },
            { projection: { _id: 1, uname: 1 } }
        );

        if (!user) return;

        console.log(`[welcome-direct] 📨 向新用户发送消息: ${user.uname} (${uid})`);

        // 检查是否已经发送过
        const alreadySent = await db.collection('plugin_welcome_logs').findOne({
            userId: uid,
            status: 'success'
        });

        if (alreadySent) {
            console.log(`[welcome-direct] 已经发送过消息给 ${user.uname}`);
            return;
        }

        // 加载语言文件
        const localeManager = new LocaleManager();
        const locale = localeManager.loadLocale('zh');

        const variables = {
            username: user.uname,
            siteName: 'HydroOJ',
            userId: uid.toString(),
            registerTime: new Date().toLocaleString('zh-CN')
        };

        const title = localeManager.replaceVariables(locale.welcome_title || '欢迎加入HydroOJ！', variables);
        const content = localeManager.replaceVariables(locale.welcome_content_text || '欢迎新用户！', variables);

        const fullMessage = `# ${title}\n\n${content}`;

        // 发送消息
        await db.collection('message').insertOne({
            _id: new ObjectId(),
            from: 1,
            to: uid,
            content: fullMessage,
            flag: 1,
            time: new Date(),
            read: false
        });

        console.log(`[welcome-direct]  已向 ${user.uname} 发送欢迎消息`);

        // 记录日志
        await db.collection('plugin_welcome_logs').insertOne({
            userId: uid,
            username: user.uname,
            status: 'success',
            sentAt: new Date(),
            message: title.substring(0, 50)
        });

    } catch (error: any) {
        console.error(`[welcome-direct] 发送消息失败:`, error.message);
    }
}

// LocaleManager 类
class LocaleManager {
    private baseDir: string;

    constructor() {
        this.baseDir = path.join(__dirname, '..');
    }

    loadLocale(lang: string): any {
        const localePath = path.join(this.baseDir, 'locale', `${lang}.yaml`);
        try {
            if (fs.existsSync(localePath)) {
                const content = fs.readFileSync(localePath, 'utf8');
                return yaml.load(content);
            }
        } catch (e) {
            console.error('[welcome-direct] 加载语言文件失败:', e);
        }
        return {
            welcome_title: '欢迎加入HydroOJ！',
            welcome_content_text: '欢迎新用户！'
        };
    }

    replaceVariables(text: string, variables: Record<string, string>): string {
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            return variables[key] || match;
        });
    }
}

export async function apply(ctx: Context): Promise<void> {
    console.log('[welcome-direct] 直接钩子插件加载');
    
    // 方法1：尝试钩子用户模型
    try {
        const userModel = require('hydrooj/src/model/user');
        const originalCreate = userModel.UserModel.create;
        
        userModel.UserModel.create = async function(...args: any[]) {
            
            // 调用原始函数
            const result = await originalCreate.apply(this, args);
            
            // 发送欢迎消息
            setTimeout(() => {
                sendWelcomeMessage(result);
            }, 3000);
            
            return result;
        };
        
        console.log('[welcome-direct] 已钩子用户创建函数');
        
    } catch (e: any) {
        console.log('[welcome-direct] 无法钩子用户模型:', e.message);
    }
    
    // 方法2：数据库触发器（轮询方式）
    let lastUserId = 0;
    
    async function checkNewUsers() {
        try {
            // 获取最大的用户ID
            const latestUser = await db.collection('user').find().sort({ _id: -1 }).limit(1).toArray();
            if (latestUser.length > 0) {
                const currentMaxId = latestUser[0]._id;
                
                if (currentMaxId > lastUserId) {
                    console.log(`[welcome-direct] 发现新用户ID: ${lastUserId + 1} 到 ${currentMaxId}`);
                    
                    // 处理新用户
                    for (let uid = lastUserId + 1; uid <= currentMaxId; uid++) {
                        if (uid > 1) { // 排除系统用户
                            await sendWelcomeMessage(uid);
                        }
                    }
                    
                    lastUserId = currentMaxId;
                }
            }
        } catch (error: any) {
            console.error('[welcome-direct] 检查新用户失败:', error.message);
        }
    }
    
    // 初始化 lastUserId
    const latestUser = await db.collection('user').find().sort({ _id: -1 }).limit(1).toArray();
    if (latestUser.length > 0) {
        lastUserId = latestUser[0]._id;
        console.log(`[welcome-direct] 当前最大用户ID: ${lastUserId}`);
    }
    
    // 设置定时检查
    setInterval(checkNewUsers, 10000); // 每10秒检查一次
    // 启动时立即检查
    setTimeout(checkNewUsers, 5000);
    

 // ============== 管理页面处理器 ==============

// 1.对应 /manage/welcome
  class WelcomeAdminPageHandler extends Handler {
        async get() {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            
            console.log('[welcome-admin] 管理页面被访问');
            
            // 获取统计信息
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            const [total, success, failed, today] = await Promise.all([
                db.collection('plugin_welcome_logs').countDocuments(),
                db.collection('plugin_welcome_logs').countDocuments({ status: 'success' }),
                db.collection('plugin_welcome_logs').countDocuments({ status: 'failed' }),
                db.collection('plugin_welcome_logs').countDocuments({ 
                    sentAt: { $gte: todayStart } 
                })
            ]);
            
            // 获取最近记录
            const logs = await db.collection('plugin_welcome_logs')
                .find()
                .sort({ sentAt: -1 })
                .limit(50)
                .toArray();
            

            
            // 使用你的模板
            this.response.template = 'welcome_admin.html';
            this.response.body = {
                stats: {
                    total,
                    success,
                    failed,
                    today
                },
                logs,
            };
        }
    }

 // ============== API接口 ==============
// 2. 对应 /api/welcome/status
    class WelcomeStatusHandler extends Handler {
        async get() {
            const stats = {
                total: await db.collection('plugin_welcome_logs').countDocuments(),
                success: await db.collection('plugin_welcome_logs').countDocuments({ status: 'success' }),
                failed: await db.collection('plugin_welcome_logs').countDocuments({ status: 'failed' })
            };
            
            this.response.body = {
                success: true,
                plugin: name,
                stats,
                time: new Date().toISOString()
            };
        }
    }
    
  // 1. 管理页面
    ctx.Route('manage_welcome', '/manage/welcome', WelcomeAdminPageHandler, PRIV.PRIV_EDIT_SYSTEM);
    
    // 2. API状态
    ctx.Route('welcome_api_status', '/api/welcome/status', WelcomeStatusHandler);
    
    
 // 3. 菜单注册（位置放在最后）
ctx.on('app/started', () => {

    // 此处可能有小问题，但能跑起来就不要动了...
    ctx.get('ui')?.inject('ControlPanel', 'manage_welcome', {
        prefix: 'manage_welcome',
    family: 'Properties',  // 可能需要的分类
    icon: 'icon-message',  // 图标
}, PRIV.PRIV_EDIT_SYSTEM);
    // console.log('[welcome-message] 控制面板菜单已注册');
});


}




