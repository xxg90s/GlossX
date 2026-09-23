(function (global) {
    let traditionalToSimplified = null;
    let openCCMissingWarned = false;

    function hasCjk(text) {
        return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(text || ""));
    }

    // Compact high-frequency simplified set for AI gloss QA only.
    // Reject only near-zero hits (encoding junk), not uncommon technical words.
    const COMMON_SIMP_CHARS = "我的你是了不一们这他在有么好个人要来那什就到会没吗去说想上看道为能吧她可很知得里以事都子生过对还下也样大啊和真时做怎天起出但只开点给把多家现如小谢些着让回走意所后别然自快它地心果跟再死用话呢太妈打定儿女见先当行等发找该最听前告因像手经被已哪中爱明面之而法作从孩西情觉成老爸问方正己次间干信谁诉年感喜错克进晚放车叫欢何候才关全比帮电安认国需应美哦动无请相常今长杀直住实机亲东带工理分吃于同特拿友斯本名种公头保活两白又其重钱力身任完高许离学更记或将受望接非思马新解警位朋加利此男部必第者少题伙您始边件外拉三呀士嘿物主玩切命希每早刚嗯几算字德结确准办查变失谈房管害场抱难总尔系计夫嘛世气哥体神处并啦父教服向通路笑掉歉备求合试姐怕官留门表救坐乐证日蛋入照远喝十停酒与提够员须清原号水星约且报球师弟交战黑医兴枪使队指二收片婚至口肯息罗界待演期搞眼送底奇伤近怪跑睡由色决识金性久火对持声影目帝拜整察海宝消音卡买尼运母军根米度飞光内制英花穿案周反鬼噢贝兄止空单便嗨愿条张王布担选棒月忙室抓病续司五助护混格站四哈校狗喂令击文托阿犯写亮达疯永忘平论注幸除否坏份弄钟客衣包继装万密杰未倒器答巴懂另兰紧越绝改血开院给象尽跳嘴易量故乎往丽取数强静式醒业礼烦视议罪点杯务敢假况付轻史麻联险讲亚恩拍各书船曾流精岁派统治首却漂局言姆趣游随基伊班赛吸妹慢城恶舞楚品控束味转半线糟冷闭林差餐造考支雷传别破及类艾程调圣偷复后连市组容脑存歌立夜建民痛终块满步梦超弹据店威逃节科赶娜划靠费迪戏律娘刻吉参呼昨简山甚卖唱叔即争恐饭功奶话元极追足风妻集术百药责呃示油政区监引六图某置猜休讨床炸楼维化毒莉祝似迎唯权洗板换排语疑苦妈录退见探射念台激介段伦傻危顾脸食团落八画庭乔赢戴魔遇秘伯挺深福当投午碰则承千热导经屁标惊仅料背聊狱该滚街哇婆断票修喔松蒂架义骗狂森顿迷丝乱听观码咱博释独值糕负耶领资玛弗择设波武产俩习显练共具觉操鱼灵发旅藏石卫牛怀啥凯替脱突究亡急竟角历检毁瑞陪验蠢香翻华爱价适闻展弃印仍速普妮胡睛按莱厌形莎屋瞧麦商索呆浪读级套踪爷句丈幕问肉丢严居南斗毛园吓误暗推皮型座脚洛从纪尸里哭丹专剧股间临规兵供养露虽沙右坚红暴谎守馆预寻双七国鸡左爆称志捕围诺姑袋烟错举职社堂谋翰防欢虑诉败困招咖私牙啡撒牌谅脏遗进李古烧测迟辆借扰冲谁判响际搬群州冰努甜众攻享细誓汤免赌概种应致帮野土冒顺模登移奥剩箱请降压纳态府拥认电货尝盖获顶恨树彼若刀户配属腿摆升关低微凶抽研状亲阻封酷伴效皇银笨无毕较哎东实技勇般摄签北抢苏吵龙康创杂忍荣尊挑网雅干镇充扔胜蒙杀么菜境夏纽聪丁锁盾伟温车族刺佛笔长吻坦鲁汉遍勒巧莫散训附塞抗恋带累猫既学输萨饿阳臭敌项译怜雪逼悲掌富质躲动徒镜摩舒课曼匙烂初诞迹营两熟透乖禁塔洲仔挂撞菲环贵采吹搭屎埃避泰毫鸟呵记醉词妓短纸雨依挥爵巨琳搜雄魂废岛欧播善机旁稍列织鞋广黄敬拒轮窗劳授迈航汽戒妙厉智艺辛厨灭聚许奖钱副痴猪良骑珍审沉源俄河离孤朝季妇宣蓝邦厅题钥灯协瓜绑医彩犹施逮糖边途马款疗忆黎骨允优变洞办草头辈赚刚结弱耳租怖圈将叛疼桌闹摸末归诚陷雇健财烈九尿恭愚嫁瑟执景访典隐扯拖档木熊握势曲瓶材惹邀例层牢育惜异尺互砸村旦督裤难劫折欠章婊碎闪漫旧祖驾青猎盘扮尤赞绍躺限软粉幻尉席姓偶梅唐缺墙蜜残朱铁补饼库确遭垃圾弧陆帅鼠洋啤颗谈娃堆劲迫嫌隔总罚净童硬寄茶憾詹拾杜宁孕秒几谓港估默胁爬奋愉潜序梯络试咬编袭赏尖踢堡丑祷胸素宇称气启党秀拳祈暂场喊备盯染晨陛够惯磨滑墨卢触仇亨庆咪症委计欺挖余鲜撤敦处援准肚朵扫讯农悔鲍损吐埋范泡敏插扎惧寓兽胎冠括擦版构体订泳宫羊傲朗摇尚批乡帐芬牲忠阴池怒爽纯员师兴帕霍稳琴宾盒盛抛羞震耐抵虫占乐胆鼻评牧乘赖葬门并惨胖暖竞刑邪贾邮距址略爹巫澡耍嘘卷恢稣伍决尾俱奏率识咒荒挡增远剑选帽葛渴须燃献万拯倍凡灰频貌浴罢宙虚敲趴键盗诗企钻阵鼓证纹癸摔仪掩艘姨绪伤策狼绿佩呐侵障墓夺贱烤捉剪彻舰裁黛姻欲域佑君遵匹沃珠描田厕液约京怨宗瞎谷壁抬甲仰郎豪战伸殿报颜厂荷述违符减省销额春针核买队零驶碍予运蛇豆惑撑号辜娶阁桑植椅贴偏尔奴载延唔端砍征拼兔牺凭逐割桥糊筑趟湖军张芝哟陈炮申宜耻担誉账肥佬箭与写饮贺裂枪续薄固勃仿奉术欣益辱洁妞忌侦购拔瞒绕殊陌卧继涉廉盟革肩宝骄齐紧产声矩阶胞珊杉佳闯邻绝慈岸单腔腊痕膀返狠舱耀召况啰闲扣脆愈仙融眠条绳辞寸猴护叶汗擅巡奔家韩辣系岁柜含韦芭瓦甩丧妒穷揍裙宽喷奸恕桶孙渡忽虎滩矶蛮脖娅铃辩臂唤坏酱疯粗伏晓荡婴逊挣柏涂惩摧渐冬飞伪漏讽愿慌轻唉侠济署幅患媒冻哼崔钢讶柔轴强趁内辑倾业潮链钩贼咯骚窃拆填肖饰灾肤缘悉湿咋煮恰粹钮愤幽舌罗烦礼巾联押秋宴议屠汁论夹嫉装参蕾董静简晕舍币庄壮艇贩萝泽玻牵艰疾昏坠宿连旋踩扇役赶夸淋蜂污歇龄霉慰轨撕却漠衡险仗碗栋慧猛昂挤妥托缩析仓售扭奈剂随堵诱组遥击溜琪毙江焦裸饭罩驱乾递逗勾捡擎视励孔僵径衫滴磅薇书讲猩覆础迁徙汇阅浏览扩页删滤馈储荐贯册截综框利润回报互相可持续资产词汇翻译条件生产弄乱搞砸鞋子鞋类鞋履";
    const COMMON_SIMP_SET = new Set(COMMON_SIMP_CHARS);

    function commonChineseRatio(text) {
        const cjk = String(text || "").match(/[\u4e00-\u9fff]/g) || [];
        if (!cjk.length) return 0;
        let hits = 0;
        for (const ch of cjk) {
            if (COMMON_SIMP_SET.has(ch)) hits += 1;
        }
        return hits / cjk.length;
    }

    /**
     * Encoding junk often yields CJK codepoints with almost no everyday characters
     * (e.g. shoes → 阒嬊紝阒嫔禤). Keep this lenient so real short glosses survive.
     */
    function looksLikeLowQualityChinese(text) {
        const cjk = String(text || "").match(/[\u4e00-\u9fff]/g) || [];
        if (cjk.length < 3) return false;
        const ratio = commonChineseRatio(text);
        if (ratio === 0) return true;
        if (cjk.length >= 4 && ratio < 0.2) return true;
        return false;
    }

    function isOpenCCReady() {
        return !!(traditionalToSimplified || global.OpenCC?.Converter);
    }

    function getTraditionalToSimplified() {
        if (traditionalToSimplified) return traditionalToSimplified;
        if (!global.OpenCC?.Converter) {
            if (!openCCMissingWarned) {
                openCCMissingWarned = true;
                console.warn(
                    "[GlossX] OpenCC not loaded; Traditional Chinese will not be converted to Simplified"
                );
            }
            return null;
        }
        try {
            traditionalToSimplified = global.OpenCC.Converter({
                from: "tw",
                to: "cn"
            });
            return traditionalToSimplified;
        } catch (error) {
            console.warn("[GlossX] OpenCC Converter init failed:", error);
            return null;
        }
    }

    function toSimplifiedChinese(text) {
        const value = String(text ?? "");
        if (!value || !hasCjk(value)) return value;

        try {
            const convert = getTraditionalToSimplified();
            return convert ? convert(value) : value;
        } catch (error) {
            console.warn("[GlossX] Traditional Chinese conversion failed:", error);
            return value;
        }
    }

    function looksLikeCjkMojibake(text) {
        const value = String(text || "");
        if (!value) return false;

        if (value.includes("\uFFFD")) return true;

        // Kana mixed into "Chinese" glosses is almost always encoding junk
        // (e.g. "浜挈浉浜ゆ偟" from mis-decoded 互相回报).
        if (/[\u3040-\u30ff]/.test(value) && /[\u4e00-\u9fff]/.test(value)) {
            return true;
        }

        // Frequent artifacts when UTF-8 Chinese bytes are decoded as GBK/GB18030.
        const markers = value.match(/[\u2032\u4f7a\u52ea\u52ed\u57c4\u590a\u5a41\u5b2a\u5b58\u5bd4\u5d86\u5f5e\u608a\u621c\u630e\u660f\u6b22\u6d93\u6e1a\u6e61\u6ed1\u6fb6\u71b6\u7455\u7470\u7487\u74a7\u753b\u7627\u7739\u7b9f\u7c2e\u7d21\u7d1d\u7f01\u7f08\u82a5\u9359\u93b4\u93b8\u93c2\u93c8\u93c9\u9422\u9473\u95b2\u95c0\u95c7\u95c9\u9612\u9a87\u9361\u6ec5\u6f6f\u951b\u951f\u6d98\u6d36\u934a\u7d31\u942c\u5c80\u6fc2\u7af7\u6748\u70b6\u4eb4\u9286\u9357\u5825\u5ea3\u6b91\u9365\u677f\u579c\u5bf0\u5b0a\u5b19\u5ad4\u6be6\u79a4\u95c6\u55d5\u8151\u7eee\u60e7\u59cf\u6c34\u7092\u4f7f\u6ee1\u701a\u7661\u4e1c\u7f07\u6f84\u4f75\u667a\u6d5c\u6308\u6d49\u505f\u63d4\u6d49]/g) || [];
        const cjkChars = value.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];

        if (markers.length >= 2) return true;
        if (markers.length >= 1
            && cjkChars.length > 0
            && markers.length / cjkChars.length >= 0.3) {
            return true;
        }

        const signatures = [
            "\u93f5\u9b5a\u8d21",
            "\u74a7\u52ea\u9a87",
            "\u74a7\u52ea\u99ed",
            "\u93c8\u590a\u57c4",
            "\u93c9\u2032\u6b22",
            "\u7f08\u660f\u7627",
            "\u9359\u93b8\u4f7a\u753b",
            "\u93b4\u621c\u6ed1",
            "\u9422\u71b6\u9a87",
            "\u7487\u5d86\u7739",
            "\u6d5c\u63d4\u6d49",
            "\u6d5c\u6308\u6d49",
            "\u92f8\u70b4\u59d4",
            "\u6d5c\u63d4\u50ec",
            "\u9612\u5b0a\u7d1d", // 阒嬊紝 (shoes mojibake sample)
            "\u95c9\u5b19\u74d2"  // 闉嬪瓙 (鞋子 as utf8-read-as-gbk)
        ];
        if (signatures.some((item) => value.includes(item))) return true;

        return false;
    }

    function decodeHtmlEntities(text) {
        let value = String(text ?? "");
        if (!value || value.indexOf("&") === -1) {
            return value;
        }

        return value
            .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
                try {
                    return String.fromCodePoint(parseInt(hex, 16));
                } catch {
                    return "";
                }
            })
            .replace(/&#(\d+);/g, (_, num) => {
                try {
                    return String.fromCodePoint(Number(num));
                } catch {
                    return "";
                }
            })
            .replace(/&nbsp;/gi, " ")
            .replace(/&quot;/gi, "\"")
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&amp;/gi, "&");
    }

    function unescapeLiteralUnicodeEscapes(text) {
        const value = String(text ?? "");
        if (!/\\u[0-9a-fA-F]{4}/i.test(value)) return value;
        return value.replace(/\\u([0-9a-fA-F]{4})/gi, (_, hex) => (
            String.fromCharCode(parseInt(hex, 16))
        ));
    }

    function looksLikeMojibake(text) {
        const value = String(text || "");
        if (!value || hasCjk(value)) return false;
        return /(?:Ã.|Â.|å.|æ.|ä.|é.|è.|ð.|þ.|ï.|¿)/.test(value)
            && !/[A-Za-z]{3,}/.test(value.replace(/(?:Ã.|Â.|å.|æ.|ä.|é.|è.|ð.|þ.|ï.|¿)/g, ""));
    }

    function repairUtf8Mojibake(text) {
        const value = String(text ?? "");
        if (!looksLikeMojibake(value)) return value;
        try {
            const bytes = Uint8Array.from(
                Array.from(value, (ch) => ch.charCodeAt(0) & 0xff)
            );
            const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
            if (hasCjk(decoded) && !decoded.includes("\uFFFD") && !looksLikeCjkMojibake(decoded)) {
                return decoded;
            }
            return value;
        } catch {
            return value;
        }
    }

    function normalizeUiText(text) {
        let value = String(text ?? "");
        if (!value) return "";

        if (hasCjk(value)
            && !looksLikeCjkMojibake(value)
            && value.indexOf("&") === -1
            && !/\\u[0-9a-fA-F]{4}/i.test(value)) {
            return value.trim();
        }

        value = unescapeLiteralUnicodeEscapes(value);
        if (value.indexOf("&") !== -1) {
            value = decodeHtmlEntities(value);
        }
        if (looksLikeCjkMojibake(value)) {
            return "";
        }
        if (!hasCjk(value)) {
            value = repairUtf8Mojibake(value);
        }
        if (looksLikeCjkMojibake(value)) {
            return "";
        }
        return value.trim();
    }

    // ASCII codes from background → Chinese copy in content/UI (avoids
    // background-script charset mojibake on Chinese error literals).
    const UI_ERROR_MESSAGES = {
        vocab_invalid_word: "单词无效",
        vocab_no_api_key: "请先在设置中配置 AI API Key，生词释义仅通过 AI 查询",
        vocab_ai_invalid_json: "AI 返回格式无效",
        vocab_ai_query_failed: "AI 查询失败",
        vocab_ai_gloss_unrecognized: "AI 返回的释义无法识别，请稍后重试",
        vocab_ai_gloss_empty: "AI 未返回可用释义，请稍后重试",
        vocab_lookup_failed: "查询失败，请重试"
    };

    function resolveUiError(error, fallback = "暂无释义") {
        const raw = String(error ?? "").trim();
        const safeFallback = normalizeUiText(fallback) || "暂无释义";
        if (!raw) return safeFallback;

        if (Object.prototype.hasOwnProperty.call(UI_ERROR_MESSAGES, raw)) {
            return UI_ERROR_MESSAGES[raw];
        }

        const normalized = normalizeUiText(raw);
        if (!normalized || looksLikeCjkMojibake(normalized) || looksLikeLowQualityChinese(normalized)) {
            return safeFallback;
        }
        return normalized;
    }

    function normalizeChineseText(text, options = {}) {
        const requireCjk = options.requireCjk !== false;
        const rejectLowQuality = options.rejectLowQuality === true;
        const value = normalizeUiText(text);
        if (!value) return "";
        if (looksLikeCjkMojibake(value)) return "";
        if (requireCjk && !hasCjk(value)) return "";
        const simplified = toSimplifiedChinese(value);
        if (looksLikeCjkMojibake(simplified)) return "";
        // Run AFTER OpenCC so Traditional glosses are not rejected as "rare".
        if (rejectLowQuality && looksLikeLowQualityChinese(simplified)) return "";
        return simplified;
    }

    function normalizeExample(example) {
        if (!example || typeof example !== "object") return null;
        const english = String(example.english || "").trim();
        const chinese = normalizeChineseText(example.chinese || "", {
            requireCjk: true,
            rejectLowQuality: true
        });
        if (!english) return null;
        return { english, chinese };
    }

    function selectBilingualExample(preferred, fallback) {
        const first = normalizeExample(preferred);
        const second = normalizeExample(fallback);

        if (first?.english && first.chinese) return first;
        if (second?.english && second.chinese) return second;
        return first || second || null;
    }

    function normalizeDefinitions(definitions, options = {}) {
        if (!Array.isArray(definitions)) return [];
        return definitions
            .map((item) => normalizeChineseText(item, {
                requireCjk: true,
                rejectLowQuality: options.rejectLowQuality === true
            }))
            .filter(Boolean)
            .filter((item, index, list) => list.indexOf(item) === index);
    }

    /** AI glosses: OpenCC + mojibake + reject near-zero common-char junk. */
    function normalizeDefinitionsFromAi(definitions) {
        return normalizeDefinitions(definitions, { rejectLowQuality: true });
    }

    async function readResponseTextUtf8(response) {
        const buffer = await response.arrayBuffer();
        return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }

    async function readResponseJsonUtf8(response) {
        const text = await readResponseTextUtf8(response);
        return JSON.parse(text);
    }

    const TextNormalize = {
        decodeHtmlEntities,
        unescapeUnicodeEscapes: unescapeLiteralUnicodeEscapes,
        hasCjk,
        isOpenCCReady,
        toSimplifiedChinese,
        commonChineseRatio,
        looksLikeLowQualityChinese,
        looksLikeCjkMojibake,
        looksLikeMojibake,
        repairUtf8Mojibake,
        normalizeUiText,
        resolveUiError,
        normalizeChineseText,
        normalizeExample,
        selectBilingualExample,
        normalizeDefinitions,
        normalizeDefinitionsFromAi,
        readResponseTextUtf8,
        readResponseJsonUtf8
    };

    global.GlossX = global.GlossX || {};
    global.GlossX.TextNormalize = TextNormalize;
})(typeof globalThis !== "undefined" ? globalThis : window);
