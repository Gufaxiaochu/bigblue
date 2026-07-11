/**
 * 文件上传云函数
 * 使用 CloudBase 的云存储替代 Supabase Storage
 * 
 * 前端调用方式：
 *   1. 先调用此函数获取上传签名
 *   2. 前端直传文件到 CloudBase 云存储
 * 
 * 或者通过云函数中转上传（文件小于 1MB 时推荐）
 */

const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || 'cmfootball-d3gp9t11528eabd1f'
});

// ========== 主函数 ==========
exports.main = async (event, context) => {
    const { action } = event;
    
    try {
        switch (action) {
            case 'getUploadToken': return await getUploadToken(event);
            case 'uploadFile': return await uploadFile(event);
            case 'deleteFile': return await deleteFile(event);
            default: return { error: '未知操作: ' + action };
        }
    } catch (err) {
        console.error('Upload error:', err);
        return { error: err.message || '服务器错误' };
    }
};

// 获取上传凭证（前端直传方式）
async function getUploadToken(event) {
    const { filePath } = event; // 如: user_id/avatar_xxx.jpg
    
    if (!filePath) return { error: '缺少文件路径' };
    
    // 使用 CloudBase 的上传能力
    // 前端可以用 @cloudbase/js-sdk 直接上传
    return {
        success: true,
        cloudPath: filePath, // 云存储路径
        // 前端使用 cloudbase.uploadFile({ cloudPath, filePath }) 上传
    };
}

// 通过云函数中转上传（base64 方式，适合小文件）
async function uploadFile(event) {
    const { fileContent, filePath, contentType } = event;
    
    if (!fileContent || !filePath) return { error: '缺少文件内容或路径' };
    
    // 将 base64 转为 Buffer
    const buffer = Buffer.from(fileContent, 'base64');
    
    // 上传到 CloudBase 云存储
    const result = await app.uploadFile({
        cloudPath: filePath,
        fileContent: buffer
    });
    
    if (result.fileID) {
        // 获取可访问的 URL
        const urlResult = await app.getTempFileURL({
            fileList: [result.fileID]
        });
        
        const url = urlResult.fileList[0]?.tempFileURL || '';
        
        return {
            success: true,
            fileID: result.fileID,
            url: url
        };
    }
    
    return { error: '上传失败' };
}

// 删除文件
async function deleteFile(event) {
    const { fileIDs } = event;
    
    if (!fileIDs || !Array.isArray(fileIDs)) {
        return { error: '缺少文件ID' };
    }
    
    const result = await app.deleteFile({
        fileList: fileIDs
    });
    
    return {
        success: true,
        result: result.deleteList
    };
}
