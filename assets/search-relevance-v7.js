(function () {
  "use strict";

  window.ykSearchRelevanceConfig = {
    version: "20260805.1",
    schoolAliases: {
      "青木小学校": ["あおき小学校", "あおき小"],
      "浄水中学校": ["じょうすい中学校", "じょうすい中"],
      "衣台高校": ["ころもだい高校", "ころもだい高"],
      "豊田西高等学校・附属中学校": [
        "豊田西高校・附属中学校", "豊田西高・附属中", "豊田西高校", "豊田西高",
        "豊田西附属中学校", "豊田西附属中"
      ]
    },
    stopWords: [
      "a", "an", "and", "for", "of", "the", "to", "with",
      "item", "items", "product", "products", "school",
      "が", "で", "と", "に", "の", "は", "へ", "も", "や", "用",
      "もの", "服", "商品", "用品", "探す", "欲しい", "ほしい", "着る"
    ],
    concepts: [
      {
        id: "socks",
        aliases: [
          "ソックス", "靴下", "くつ下", "くつした", "スクールソックス",
          "sock", "socks", "school sock", "school socks", "stocking", "stockings"
        ],
        related: ["footwear"]
      },
      {
        id: "footwear",
        allowRelatedResults: true,
        aliases: [
          "靴", "くつ", "シューズ", "運動靴", "通学靴",
          "shoe", "shoes", "sneaker", "sneakers", "footwear"
        ],
        related: ["indoor_shoes", "gym_shoes", "sandals"]
      },
      {
        id: "indoor_shoes",
        aliases: [
          "上履き", "上ばき", "上靴", "上ぐつ", "うわばき", "うわぐつ", "バレーシューズ",
          "school shoes", "indoor shoes", "uwabaki"
        ],
        related: ["footwear", "gym_shoes", "sandals"]
      },
      {
        id: "gym_shoes",
        aliases: [
          "体育館シューズ", "体育館履き", "体育館ばき", "体育館靴", "体育シューズ", "体育館用シューズ", "体育館用靴",
          "gym shoes", "indoor sports shoes", "PE shoes"
        ],
        related: ["footwear", "indoor_shoes"]
      },
      {
        id: "sandals",
        aliases: [
          "サンダル", "スリッパ", "スクールサンダル",
          "sandal", "sandals", "slipper", "slippers"
        ],
        related: ["footwear", "indoor_shoes"]
      },
      {
        id: "gymwear",
        aliases: [
          "体操服", "体操着", "体操ふく", "体操ぎ", "体そう服", "たいそうふく", "たいそふく", "たいそーふく",
          "たいそうぎ", "たいそう着", "たいそうぶく", "体育着", "体育服", "運動着",
          "gym clothes", "gymclothes", "gym wear", "gymwear",
          "PE uniform", "PE clothes", "exercise clothes"
        ],
        related: ["jersey", "shorts", "pants", "shirt"]
      },
      {
        id: "jersey",
        aliases: [
          "ジャージ", "じゃーじ", "ジャジ", "じやーじ", "じぁーじ", "ジャージー", "ジャーヂ", "ジヤージ", "しゃーじ", "jya-ji",
          "トレーニングウェア", "トラックスーツ",
          "tracksuit", "track suit", "track jacket", "track pants",
          "training wear", "jersey"
        ],
        related: ["gymwear", "outerwear", "pants"]
      },
      {
        id: "uniform",
        aliases: [
          "制服", "せいふく", "学生服", "標準服", "学校制服", "学生制服", "学校の制服",
          "uniform", "school uniform", "schooluniform", "student uniform"
        ],
        related: []
      },
      {
        id: "sailor_uniform",
        aliases: ["セーラー服", "セーラー", "せーらーふく", "sailor uniform"],
        related: ["uniform"]
      },
      {
        id: "gakuran",
        aliases: ["学ラン", "がくらん", "詰襟", "詰衿", "詰め襟", "つめえり", "stand collar uniform"],
        related: ["uniform"]
      },
      {
        id: "uniform_blazer",
        aliases: ["ブレザー", "制服ブレザー", "school blazer", "blazer uniform"],
        related: ["uniform"]
      },
      {
        id: "preschool_uniform",
        aliases: ["通園服", "園内服", "園児服", "幼稚園制服"],
        related: ["uniform"]
      },
      {
        id: "uniform_blouse",
        aliases: ["オーバーブラウス", "ブラウス", "スクールブラウス", "blouse", "blouses"],
        related: ["uniform", "shirt"]
      },
      {
        id: "uniform_shirt",
        aliases: ["制服シャツ", "スクールシャツ", "カッターシャツ", "ニットシャツ", "school shirt"],
        related: ["uniform", "shirt"]
      },
      {
        id: "uniform_ribbon",
        aliases: ["制服 リボン", "制服リボン", "ワンタッチリボン", "三角リボン", "棒タイリボン", "棒タイ", "三角タイ", "リボン"],
        related: ["uniform"]
      },
      {
        id: "uniform_necktie",
        aliases: ["制服ネクタイ", "ネクタイ", "スクールネクタイ", "school tie"],
        related: ["uniform"]
      },
      {
        id: "uniform_collar_cover",
        aliases: ["衿カバー", "襟カバー", "えりカバー"],
        related: ["uniform", "sailor_uniform"]
      },
      {
        id: "shirt",
        aliases: [
          "シャツ", "shirt", "shirts"
        ],
        related: ["gymwear", "uniform", "outerwear"]
      },
      {
        id: "t_shirt",
        aliases: ["Tシャツ", "ティーシャツ", "丸首シャツ", "t shirt", "t-shirt", "tee"],
        related: ["shirt", "gymwear"]
      },
      {
        id: "polo_shirt",
        aliases: ["ポロシャツ", "polo", "polo shirt"],
        related: ["shirt"]
      },
      {
        id: "shorts",
        aliases: [
          "短パン", "半ズボン", "半ずぼん", "ハーフパンツ", "ショートパンツ",
          "shorts", "short pants", "half pants", "gym shorts"
        ],
        related: ["gymwear", "pants"]
      },
      {
        id: "pants",
        aliases: [
          "ズボン", "パンツ", "スラックス", "ストレートパンツ",
          "pants", "trousers", "slacks", "long pants", "bottoms"
        ],
        related: ["shorts", "jersey", "uniform"]
      },
      {
        id: "long_pants",
        aliases: ["長ズボン", "長ずぼん", "ロングパンツ", "long trousers"],
        related: ["pants"]
      },
      {
        id: "skirt",
        aliases: ["スカート", "プリーツスカート", "skirt", "skirts", "pleated skirt"],
        related: ["uniform"]
      },
      {
        id: "outerwear",
        aliases: [
          "上着", "ジャケット", "コート", "ブルゾン", "ジャンパー", "ウインドブレーカー",
          "アウター", "jacket", "jackets", "coat", "coats", "blouson",
          "jumper", "windbreaker", "outerwear"
        ],
        related: ["uniform", "jersey", "rainwear"]
      },
      {
        id: "headwear",
        aliases: [
          "帽子", "ぼうし", "キャップ", "hat", "hats", "cap", "caps"
        ],
        related: ["uniform", "gymwear"]
      },
      {
        id: "red_white_cap",
        aliases: ["赤白帽", "赤白帽子", "赤白ぼうし", "紅白帽", "紅白帽子", "red white cap"],
        related: ["headwear", "gymwear"]
      },
      {
        id: "pe_cap",
        aliases: ["体育帽", "体育帽子", "体操帽", "体操帽子", "運動帽"],
        related: ["red_white_cap", "headwear", "gymwear"]
      },
      {
        id: "yellow_school_cap",
        aliases: ["通学黄帽子", "通学黄帽", "黄帽子", "黄帽", "通学帽子", "通学帽", "school cap"],
        related: ["headwear", "school_commute"]
      },
      {
        id: "bag",
        aliases: [
          "鞄", "かばん", "カバン", "バッグ", "バック", "bag", "bags"
        ],
        related: ["school_bag", "preschool_bag", "pool_bag", "bag_cover"]
      },
      {
        id: "school_bag",
        aliases: [
          "スクールバッグ", "スクバ", "通学バッグ", "通学専用バッグ", "通学カバン", "通学鞄",
          "通学リュック", "スクールリュック", "リュック", "school bag", "backpack", "rucksack"
        ],
        related: ["bag", "school_commute"]
      },
      {
        id: "preschool_bag",
        aliases: ["通園バッグ", "通園バック", "園児バッグ", "kindergarten bag"],
        related: ["bag"]
      },
      {
        id: "pool_bag",
        aliases: ["プールバッグ", "水泳バッグ", "スイムバッグ", "pool bag", "swim bag"],
        related: ["bag", "swimwear"]
      },
      {
        id: "bag_cover",
        aliases: ["カバンカバー", "バッグカバー", "bag cover", "backpack cover"],
        related: ["bag", "rainwear"]
      },
      {
        id: "rainwear",
        aliases: [
          "雨具", "雨合羽", "雨ガッパ", "かっぱ", "レインウェア", "レインウエア", "レインコート", "雨の日",
          "rainwear", "rain wear", "raincoat", "rain coat", "rain suit",
          "waterproof clothes", "rainy day clothes"
        ],
        related: ["outerwear", "bag_cover"]
      },
      {
        id: "swimwear",
        aliases: [
          "水着", "スクール水着", "水泳着", "競泳", "セパレーツ水着",
          "swimwear", "swimsuit", "swim suit", "swimming wear",
          "school swimsuit"
        ],
        related: ["rash_guard", "swim_cap", "swim_goggles", "swim_supporter", "swim_inner", "swim_pad"]
      },
      {
        id: "rash_guard",
        aliases: ["ラッシュガード", "ラッシュガード水着", "rash guard", "rashguard"],
        related: ["swimwear"]
      },
      {
        id: "swim_cap",
        aliases: ["水泳帽", "水泳帽子", "スイムキャップ", "スイミングキャップ", "swim cap", "swimming cap"],
        related: ["swimwear", "headwear"]
      },
      {
        id: "swim_goggles",
        aliases: ["水泳ゴーグル", "スイムゴーグル", "ゴーグル", "水中眼鏡", "swim goggles", "swimming goggles"],
        related: ["swimwear"]
      },
      {
        id: "swim_supporter",
        aliases: ["スイムサポーター", "水泳サポーター", "スイムガードル", "swim supporter"],
        related: ["swimwear"]
      },
      {
        id: "swim_inner",
        aliases: ["水着インナー", "水着用インナー", "トップスインナー", "swim inner"],
        related: ["swimwear"]
      },
      {
        id: "swim_pad",
        aliases: ["水着パッド", "水着パット", "差し込みパッド", "差し込みパット", "swim pad"],
        related: ["swimwear"]
      },
      {
        id: "helmet",
        aliases: [
          "ヘルメット", "自転車用ヘルメット",
          "helmet", "bike helmet", "bicycle helmet", "cycling helmet"
        ],
        related: ["rainwear"]
      },
      {
        id: "helmet_kabuto",
        aliases: ["OGKカブト", "オージーケーカブト", "カブト"],
        related: ["helmet"]
      },
      {
        id: "brand_barbie",
        aliases: ["Barbie", "バービー"],
        related: []
      },
      {
        id: "chopsticks",
        aliases: [
          "箸", "お箸", "はし", "おはし", "chopstick", "chopsticks"
        ],
        related: ["school_lunch_set", "cutlery"]
      },
      {
        id: "school_lunch_set",
        aliases: [
          "給食", "給食セット", "給食用品", "はしセット", "箸セット",
          "ランチセット", "カトラリーセット", "school lunch set", "lunch set"
        ],
        related: ["chopsticks", "cutlery"]
      },
      {
        id: "school_lunch_wear",
        aliases: ["給食着", "給食衣", "給食白衣", "給食エプロン", "給食帽", "給食帽子"],
        related: []
      },
      {
        id: "cutlery",
        aliases: [
          "スプーン", "フォーク", "カトラリー", "食器", "spoon", "fork", "cutlery"
        ],
        related: ["school_lunch_set", "chopsticks"]
      },
      {
        id: "school_commute",
        allowRelatedResults: true,
        aliases: [
          "通学", "登校", "学校へ行く", "school commute", "commuting to school"
        ],
        related: ["bag", "footwear", "uniform", "rainwear"]
      },
      {
        id: "school_start",
        allowRelatedResults: true,
        aliases: [
          "入学準備", "新学期", "学校準備", "入園準備",
          "back to school", "school starter", "starting school", "school essentials"
        ],
        related: ["uniform", "gymwear", "footwear", "bag", "headwear"]
      },
      {
        id: "embroidery",
        aliases: [
          "名入れ", "名前入れ", "ネーム入れ", "刺繍", "ネーム刺繍",
          "name embroidery", "embroidered name", "personalization", "personalised"
        ],
        related: []
      },
      {
        id: "sale",
        aliases: [
          "プライスダウン", "値下げ", "セール", "特価", "処分品", "旧タイプ", "旧モデル", "訳あり",
          "sale", "discount", "discounted", "clearance", "price down", "outlet", "bargain"
        ],
        related: []
      },
      {
        id: "short_sleeve",
        aliases: ["半袖", "半そで", "はんそで", "短袖", "short sleeve", "short sleeves", "short-sleeved"],
        related: []
      },
      {
        id: "long_sleeve",
        aliases: ["長袖", "長そで", "ながそで", "long sleeve", "long sleeves", "long-sleeved"],
        related: []
      },
      {
        id: "boys",
        aliases: ["男子", "男児", "男の子", "boys", "boy", "mens", "men", "male"],
        related: ["unisex"]
      },
      {
        id: "girls",
        aliases: ["女子", "女児", "女の子", "girls", "girl", "womens", "women", "female"],
        related: ["unisex"]
      },
      {
        id: "unisex",
        aliases: ["男女兼用", "男女共用", "兼用", "unisex", "gender neutral"],
        related: ["boys", "girls"]
      },
      {
        id: "school_primary",
        aliases: ["小学校", "小学", "小学生", "elementary school", "primary school", "elementary"],
        related: []
      },
      {
        id: "school_middle",
        aliases: ["中学校", "中学", "中学生", "junior high school", "middle school", "junior high"],
        related: []
      },
      {
        id: "school_high",
        aliases: ["高校", "高等学校", "高校生", "high school", "senior high school"],
        related: []
      },
      {
        id: "school_preschool",
        aliases: [
          "幼稚園", "保育園", "こども園", "園児",
          "kindergarten", "preschool", "nursery school"
        ],
        related: []
      },
      {
        id: "summer",
        aliases: ["夏", "夏用", "サマー", "暑い日", "summer", "summer clothes", "hot weather"],
        related: ["short_sleeve"]
      },
      {
        id: "winter",
        aliases: ["冬", "冬用", "防寒", "寒い日", "winter", "winter clothes", "cold weather"],
        related: ["long_sleeve", "outerwear"]
      },
      {
        id: "quick_dry",
        aliases: [
          "吸汗速乾", "速乾", "ドライ", "汗をかく", "汗対策",
          "quick dry", "quick-dry", "moisture wicking", "dry fit"
        ],
        related: ["gymwear", "shirt"]
      },
      {
        id: "color_navy",
        aliases: ["紺", "濃紺", "ネイビー", "navy", "navy blue"],
        related: []
      },
      {
        id: "color_blue",
        aliases: ["青", "ブルー", "サックス", "水色", "blue", "light blue", "sky blue", "sax blue"],
        related: []
      },
      {
        id: "color_red",
        aliases: ["赤", "レッド", "red"],
        related: []
      },
      {
        id: "color_white",
        aliases: ["白", "ホワイト", "white"],
        related: []
      },
      {
        id: "color_black",
        aliases: ["黒", "ブラック", "black"],
        related: []
      },
      {
        id: "color_green",
        aliases: ["緑", "グリーン", "green"],
        related: []
      },
      {
        id: "color_yellow",
        aliases: ["黄", "黄色", "イエロー", "yellow"],
        related: []
      },
      {
        id: "color_pink",
        aliases: ["ピンク", "桃色", "pink"],
        related: []
      },
      {
        id: "color_gray",
        aliases: ["灰色", "グレー", "gray", "grey"],
        related: []
      },
      {
        id: "color_purple",
        aliases: ["紫", "パープル", "バイオレット", "purple", "violet"],
        related: []
      }
    ]
  };
})();
