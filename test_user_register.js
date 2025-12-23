const db = require('./packages/hydrooj/src/service/db').db;
const { bus } = require('./packages/hydrooj/src/service/bus');

console.log('测试用户注册事件...');

// 模拟用户注册事件
async function testUserRegister() {
    try {
        // 触发事件
        console.log('触发 user/register 事件...');
        bus.emit('user/register', 10001);
        
        // 也可以触发另一个可能的事件名
        setTimeout(() => {
            console.log('触发 UserRegister 事件...');
            bus.emit('UserRegister', 10002);
        }, 1000);
        
        console.log('事件已触发，请查看 HydroOJ 日志');
        
    } catch (error) {
        console.error('错误:', error.message);
    }
}

testUserRegister();
