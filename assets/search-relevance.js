(function () {
  "use strict";

  window.ykSearchRelevanceConfig = {
    version: "20260731.2",
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
        aliases: [
          "靴", "くつ", "シューズ", "運動靴", "通学靴",
          "shoe", "shoes", "sneaker", "sneakers", "footwear"
        ],
        related: ["indoor_shoes", "gym_shoes", "sandals", "socks"]
      },
      {
        id: "indoor_shoes",
        aliases: [
          "上履き", "上靴", "上ぐつ", "うわぐつ", "バレーシューズ",
          "school shoes", "indoor shoes", "uwabaki"
        ],
        related: ["footwear", "gym_shoes", "sandals"]
      },
      {
        id: "gym_shoes",
        aliases: [
          "体育館シューズ", "体育館靴", "体育シューズ",
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
          "体操服", "体操着", "体そう服", "たいそうふく", "体育着", "体育服", "運動着", "運動会", "体育祭", "部活",
          "gym clothes", "gym wear", "gymwear", "sportswear", "sports wear",
          "PE uniform", "PE clothes", "exercise clothes", "sports day clothes"
        ],
        related: ["jersey", "shorts", "pants", "shirt"]
      },
      {
        id: "jersey",
        aliases: [
          "ジャージ", "トレーニングウェア", "トラックスーツ",
          "tracksuit", "track suit", "track jacket", "track pants",
          "training wear", "jersey"
        ],
        related: ["gymwear", "outerwear", "pants"]
      },
      {
        id: "uniform",
        aliases: [
          "制服", "学生服", "標準服", "セーラー服", "ブレザー", "通園服",
          "uniform", "school uniform", "student uniform", "sailor uniform",
          "blazer", "ceremony clothes", "school ceremony"
        ],
        related: ["shirt", "skirt", "pants", "outerwear"]
      },
      {
        id: "shirt",
        aliases: [
          "シャツ", "Tシャツ", "ティーシャツ", "ポロシャツ", "ブラウス", "ニットシャツ",
          "shirt", "shirts", "t shirt", "t-shirt", "tee", "polo", "polo shirt",
          "blouse", "blouses"
        ],
        related: ["gymwear", "uniform", "outerwear"]
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
          "ズボン", "長ズボン", "長ずぼん", "パンツ", "スラックス", "ストレートパンツ",
          "pants", "trousers", "slacks", "long pants", "bottoms"
        ],
        related: ["shorts", "jersey", "uniform"]
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
          "帽子", "ぼうし", "キャップ", "赤白帽", "赤白ぼうし", "紅白帽", "黄帽子",
          "hat", "hats", "cap", "caps", "school cap", "red white cap"
        ],
        related: ["uniform", "gymwear"]
      },
      {
        id: "bag",
        aliases: [
          "鞄", "かばん", "カバン", "バッグ", "バック", "リュック", "通学バッグ",
          "bag", "bags", "school bag", "backpack", "rucksack"
        ],
        related: ["bag_cover"]
      },
      {
        id: "bag_cover",
        aliases: ["カバンカバー", "バッグカバー", "bag cover", "backpack cover"],
        related: ["bag", "rainwear"]
      },
      {
        id: "rainwear",
        aliases: [
          "雨合羽", "雨ガッパ", "かっぱ", "レインウェア", "レインコート", "雨の日",
          "rainwear", "rain wear", "raincoat", "rain coat", "rain suit",
          "waterproof clothes", "rainy day clothes"
        ],
        related: ["outerwear", "bag_cover"]
      },
      {
        id: "swimwear",
        aliases: [
          "水着", "スクール水着", "競泳", "セパレーツ水着", "ラッシュガード",
          "swimwear", "swimsuit", "swim suit", "swimming wear",
          "school swimsuit", "rash guard"
        ],
        related: ["swim_accessory"]
      },
      {
        id: "swim_accessory",
        aliases: [
          "スイムサポーター", "水泳帽", "スイムキャップ",
          "swim supporter", "swim cap", "swimming cap"
        ],
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
        id: "school_commute",
        aliases: [
          "通学", "登校", "学校へ行く", "school commute", "commuting to school"
        ],
        related: ["bag", "footwear", "uniform", "rainwear"]
      },
      {
        id: "school_start",
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
        aliases: ["半袖", "短袖", "short sleeve", "short sleeves", "short-sleeved"],
        related: []
      },
      {
        id: "long_sleeve",
        aliases: ["長袖", "long sleeve", "long sleeves", "long-sleeved"],
        related: []
      },
      {
        id: "boys",
        aliases: ["男子", "男児", "男の子", "詰襟", "学ラン", "boys", "boy", "mens", "men", "male"],
        related: ["unisex"]
      },
      {
        id: "girls",
        aliases: ["女子", "女児", "女の子", "セーラー服", "セーラー", "girls", "girl", "womens", "women", "female"],
        related: ["unisex"]
      },
      {
        id: "unisex",
        aliases: ["男女兼用", "男女共用", "兼用", "unisex", "gender neutral"],
        related: ["boys", "girls"]
      },
      {
        id: "school_primary",
        aliases: ["小学校", "小学生", "elementary school", "primary school", "elementary"],
        related: []
      },
      {
        id: "school_middle",
        aliases: ["中学校", "中学生", "junior high school", "middle school", "junior high"],
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
