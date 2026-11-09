# ブラウザでの文献情報抽出モデルの調査

調査日: 2026-11-09。対象は日英の学術文献からタイトル・全著者・出版年月・文献種別を取り出し、biblatex とファイル名を生成する用途。

現行の1ページ目のフォントサイズ・位置・正規表現による推定は削除した。PDF の埋め込みメタデータ読み取りと、右側での手動編集は維持する。以下は次の方式を選ぶための調査で、モデルの採用・組み込みは行っていない。

## 結論

複数のブラウザを対象にする最初の比較実験には **Qwen3.5-0.8B と 2B** を推す。ページ画像から直接 JSON を生成する方式と、PDF から抽出したテキストを JSON に構造化する方式を、同じモデル系列で比較できる。ONNX 版と Transformers.js / WebGPU の利用例があり、ブラウザへの実装経路が具体的である。日本語の人名や小さい脚注を正しく読めるかは実測が必要で、0.8B で十分とは判断しない。

軽量さを優先する比較対象は **Granite Docling 258M**。ただし公式に日本語対応は experimental とされており、日本語の主力として即採用しない。日本語OCRを重視する比較対象は **GLM-OCR**。抽出タスク自体への適合度を重視する比較対象は **NuExtract 2.0 2B / NuExtract3** だが、ブラウザへの移植・変換の作業量が増える。

「小さいモデルなら今のルールより必ず正確」とは言えない。モデルカードの文書認識ベンチマークも、学術文献の書誌抽出や日本語著者名の正確さを直接示すものではない。

## 主要候補

容量は、調査時点の Hugging Face モデルAPIに記載された ONNX グラフと external data のサイズを合算した十進 MB/GB。特記のない表内の容量は全コンポーネントを `q4f16` にした配布物で、トークナイザ・ランタイム・実行時バッファ・KVキャッシュは含まない。モデルカードの推奨 dtype 構成と異なる場合があり、この構成の動作や精度を検証した値ではない。

| 候補 | 入力と本用途への適合 | ブラウザへの経路 | 配布容量の例 | 主なトレードオフ |
|---|---|---|---|---|
| Qwen3.5-0.8B | テキスト・画像。多言語、書誌JSONを直接指示できる | ONNX-OPT と Transformers.js / WebGPU の例あり。公開版 Transformers.js 4.3.2 に `qwen3_5` 実装を確認 | 約646MB | 導入しやすい候補だが、小さな漢字・人名・著者順・年度の取り違えは要実測 |
| Qwen3.5-2B | 同じ方式で0.8Bより大きなモデルを比較可能 | ONNX-OPT の重みあり。同系列のランタイム対応を利用する経路 | 約1.58GB | 精度向上の可能性と引き換えに、転送量・GPUメモリ・初回起動コストが増える。向上幅は未測定 |
| Granite Docling 258M | 文書画像→DocTags。見出し・本文・表などを構造化する文書特化モデル | ONNX版に Transformers.js の利用例あり。ページ分割処理もある | 約264MB | 日本語は公式に experimental。DocTags→書誌フィールドの対応付けが別途必要で、著者抽出専用ではない |
| GLM-OCR 0.9B | 文書画像→テキスト・表等。公式カードが日本語を含む8言語を列挙 | ONNX重みあり。Transformers.js 4.3.2 に `glm_ocr` 実装を確認 | 約653MB | ブラウザ上の実機確認が必要。OCR結果から著者・出版年等を決める段階が別途必要 |
| Qwen3-0.6B | PDFから取れた文字列→書誌JSON。画像は入力できない | Transformers.js / WebGPU の明示例、WebLLM の登録モデルあり | 約570MB（ONNX q4f16） | OCR不要のPDFには有利。文字化け・段組の読み順・上付き所属番号は文字列側の課題として残る |
| NuExtract 2.0 2B | 画像・テキスト＋JSONテンプレート→構造化抽出。今回の用途に近い | Qwen2-VLベース。確認した公式例はPython系で、即利用できるブラウザ導入例は未確認 | 公式 safetensors 約4.42GB。ブラウザ量子化版の容量は未確認 | 抽出専用の学習は魅力だが、ONNX/MLCへの変換とテンプレート処理の移植が必要 |
| NuExtract3 4B | 文書画像・文字列から構造化抽出。非推論モードも利用可能 | 公開重み・GGUF/W4A16等はあるが、今回の調査でブラウザ用ONNX配布は確認できなかった | 公式モデル重み約9.08GB。ブラウザ用量子化容量は未確認 | 品質重視の比較対象。最初から全端末向けブラウザ機能にするには大きい |

主な配布条件は、Qwen3.5 / Qwen3 / Granite Docling / NuExtract3 が Apache-2.0、GLM-OCR / NuExtract 2.0 2B が MIT。元モデルと変換版の両方のライセンスとリビジョンを、実際に採用するファイルで確認する必要がある。

容量の確認に使用した変換版のリビジョン:

- Qwen3.5-0.8B-ONNX-OPT: `9a4c21d8f724176b0a7edaaed36303044451886e`、q4f16構成 645,614,735 bytes。
- Qwen3.5-2B-ONNX-OPT: `ed446636739bf426e73c5a00714fd8e010d36c21`、1,580,952,311 bytes。
- Granite Docling: `e8602580df77443fc3421cf3bae0601da601e5c6`、264,311,910 bytes。
- GLM-OCR: `aea46198f09e3aa2b63422dd234f1cc66afffe52`、652,710,345 bytes。
- Qwen3-0.6B: `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0`、569,789,750 bytes。

## Chrome限定を許容する場合

Chrome の **Prompt API（ブラウザ内蔵モデル）** も有力な別案である。公式ドキュメントでは日本語・英語を含む言語の指定、画像入力、JSON Schemaを使う出力制約が説明されている。モデルの配布と更新をブラウザに任せられるため、アプリ側でONNXファイルをホスティング・変換する必要がない。

一方、一般のWebブラウザで共通に使えるAPIではなく、端末要件が強い。公式にモバイルは非対応、Chromeプロファイルのあるボリュームに空き22GB以上、GPUならVRAMが4GB超、CPUならRAM16GB以上と4コア以上等が必要とされる。**22GBは必要な空き容量で、モデルのダウンロードサイズではない。** ブラウザがモデルを更新するため、モデル版をアプリ側で固定する方式とも条件が異なる。

Chromeの対応PCだけでよければ、これをQwen系と並べて小さなPoCで比較する価値がある。APIの存在判定だけで対応済みとせず、日本語と画像を含む条件で `LanguageModel.availability()` を確認する。実際のPDFでの書誌抽出精度と処理速度は未測定である。

## 他に調べた選択肢

| 選択肢 | 使い方と評価 |
|---|---|
| PP-OCRv5 mobile / server + 小型LLM | 日本語を明記したOCR。mobile_recの公式認識重みは約16.5MBで、軽量な候補。ただし文字検出・回転補正・辞書・書誌抽出器が別途必要で、これがシステム全体のサイズではない。ブラウザ用ONNX変換・前後処理・日本語の実測が必要。GPUなしの構成を検討する価値がある |
| PaddleOCR-VL-1.5 0.9B | 文書解析特化で Apache-2.0。ONNX変換版は存在するが、確認した変換版の説明はCPU/OpenVINO向け。ONNXの存在を、そのままWebGPU動作の証明にはできない。OCR・文書構造が必要なときの追加候補 |
| GLiNER multi-v2.1 / GLiNER2.5 Multi | テキストから人名・日付・任意ラベルのスパンを抽出する別方向の候補。multi-v2.1に Transformers.js 対応ONNX版がある。2.5 Multiは287M。画像を読まず、タイトルと単なる見出し、著者と本文中の人名、出版年と引用年を区別できるかは別問題。日本語学術文献での評価・追加学習が必要 |
| Gemma 3 1B | 多言語テキストモデルでブラウザONNX利用例がある。1B版は画像を読まない。Gemma独自の利用条件があり、Apache/MITモデルとは配布条件が異なる。テキスト抽出方式の比較対象にはなる |
| SmolVLM2 500M | 軽量な画像モデルだが、公式カードの言語はEnglish。日本語著者名を含む主力候補にする根拠が不足する。英語中心の比較対象 |
| Florence-2 base | OCRと領域情報を扱える小型画像モデル。日本語学術文献の書誌抽出を保証する資料は今回確認できず、主力候補から外す |
| LayoutLMv3 / LayoutXLM | OCRテキスト・座標・画像を組み合わせるレイアウトモデル。書誌ラベルへの追加学習が必要。確認したMicrosoft公開重みは CC-BY-NC-SA-4.0 で、商用利用や配布の自由度に制約がある。短期の代替には不向き |
| GROBID | 学術PDFのヘッダー・著者・引用文献抽出という用途自体には強く合う。Apache-2.0。Javaサービスとしての利用が中心で、GitHub Pagesだけでは動かない。ローカルサーバーを許容する案として比較する。日本語の対象文献での精度は未確認 |
| DOI→Crossref等で照合 | モデルとは別の補助手段。DOIを確実に取得できる場合、書誌データを照合して生成誤りを減らせる。DOIなしのPDFや未収録文献には使えず、ネットワーク接続も必要。本文やPDFを送る必要はないが、問い合わせ自体は外部通信になる |

## 実行基盤と配布の現実性

- **Transformers.js / ONNX Runtime Web**: テキストモデルと画像モデルを同じJavaScript系で扱える。今回取得した公開版は Transformers.js 4.3.2。公開npmパッケージ内で Qwen3.5・GLM-OCR・SmolVLM・Florence-2 のモデル実装を確認した。API対応とモデル配布は実機での安定性とは別である。
- **WebLLM**: WebGPU上でLLMを動かし、JSON Schemaを使う構造化生成・Worker・モデルキャッシュを提供する。Qwen3-0.6B q4f16は登録リストで `vram_required_MB: 1403.34` とされている。これは配布物570MBや今回の実測VRAMとは別の値で、入力長・設定・ランタイムが異なれば変わる。
- **MediaPipe LLM Inference**: ブラウザ内実行の別経路があるが、対応モデルを専用形式に変換する必要がある。どのHugging Faceモデルでもそのまま読み込める仕組みではない。
- **WASM / CPU**: 軽量OCRやエンコーダーモデルには検討余地がある。画像生成型モデルやLLMをCPUで動かす場合の待ち時間は実測前提で、WebGPU版と同じ体験を約束しない。
- **WebGPUと端末差**: HTTPS上のGitHub Pagesは配布先として使えるが、ユーザー端末のGPU機能・メモリ・ブラウザ対応は検出が必要。スマホとPCを同じモデル・解像度で扱わない。
- **GitHub Pagesの制約**: WebGPUを使う経路と、WASMをマルチスレッド化する経路は別に考える。WASMスレッドに必要なSharedArrayBufferとcross-origin isolationは、ブラウザと配信ヘッダーの条件がある。GitHub Pagesの通常設定で任意のCOOP/COEPヘッダーを追加できると仮定せず、単スレッドWASMまたはWebGPUから検証する。
- **単一HTMLとの関係**: UI自体を単一HTMLに保つことはできる。しかし数百MB〜GBの重みやWASMをHTMLへ埋め込む設計は勧めない。モデルは明示的な初回ダウンロード＋ブラウザキャッシュに分離し、ダウンロード・削除・容量表示を提供する。ダウンロード前から完全オフラインで使う要件まで維持するなら、HTMLとモデルの配布パック等へ要件変更が必要。

## 比較実験の案

これは未実施の提案である。Chrome限定を許容する場合は、内蔵Prompt APIも同一の評価セットで比較する。

1. **Qwen3.5-0.8B と 2B** で、同じ1ページ目画像を入力する。タイトル・全著者・出版年月・会議名・文献種別を固定スキーマのJSONで取得する。最初は短い非推論モード・greedy生成を使い、生成時間と出力長を制限する。
2. **文字が正常に取り出せるPDF** では、同じQwen系に抽出テキストを渡す方式と比較する。フォントサイズ等の手作業ルールで書誌項目を決める処理は戻さない。文字列に座標・改行情報を付けるかも比較する。
3. **画像側の小さい日本語文字が読めない場合** は、解像度と上部・下部の拡大、GLM-OCR、Granite Docling、PP-OCRv5の順に比較対象を広げる。画像モデルに文字が読めないままJSONだけ強制しても、正確さは改善しない。
4. **構造化抽出の精度が足りない場合** は、NuExtract 2.0 2B / NuExtract3をまず対応ランタイムで評価し、精度差が移植コストに見合うか判断する。最初からブラウザ用変換へ投資しない。
5. 日英それぞれ20〜30件程度を目安に、段組・複数著者・所属番号・会議ヘッダー・日付欠落・文字化け・画像PDFを含める。タイトル一致、全著者の順序と姓名、出版年の正確さ、未記載をnullにできる率、誤った値の捏造率を別々に計測する。
6. 初回ダウンロード量、初回準備時間、2回目の待ち時間、失敗率、メモリ不足、スマホでの操作性も計測する。公開ベンチマークの数値を本用途の精度や処理秒数として使わない。
7. 書誌JSONから既存の変換関数でbibを生成する。モデルにbibの構文・不要フィールド除去・ファイル名の安全化まで任せない。抽出した文字列・ページ内の根拠を確認できるようにし、欠落値の捏造よりnullを優先する。

アップロードされた著作権付きPDFと本文は、調査のためにモデル配布元や外部APIへ送信していない。公開コード・レポート・回帰テストにも含めていない。

## 主な一次資料

- Qwen3.5-0.8B: https://huggingface.co/Qwen/Qwen3.5-0.8B
- Qwen3.5 ONNX / ブラウザ例: https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX-OPT
- Qwen3.5-2B ONNX: https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX-OPT
- Qwen3 / ブラウザ例: https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX
- Granite Docling / 日本語experimental: https://huggingface.co/ibm-granite/granite-docling-258M
- Granite Docling ブラウザ例: https://huggingface.co/onnx-community/granite-docling-258M-ONNX
- GLM-OCR / 日本語の列挙: https://huggingface.co/zai-org/GLM-OCR
- GLM-OCR ONNX: https://huggingface.co/onnx-community/GLM-OCR-ONNX
- NuExtract 2.0 2B: https://huggingface.co/numind/NuExtract-2.0-2B
- NuExtract3: https://huggingface.co/numind/NuExtract3
- PP-OCRv5 mobile: https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_rec
- PaddleOCR-VL-1.5: https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5
- PaddleOCR-VL ONNX変換例: https://huggingface.co/onnx-community/PaddleOCR-VL-1.5-ONNX
- GLiNER2.5 Multi: https://huggingface.co/fastino/gliner2.5-multi-v1
- GLiNER multi ブラウザ用ONNX: https://huggingface.co/onnx-community/gliner_multi-v2.1
- Gemma 3: https://ai.google.dev/gemma/docs/core/model_card_3
- Gemma 3 1B ONNX: https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX
- SmolVLM2: https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct
- Florence-2: https://huggingface.co/microsoft/Florence-2-base
- LayoutLMv3: https://huggingface.co/microsoft/layoutlmv3-base
- LayoutXLM: https://huggingface.co/microsoft/layoutxlm-base
- GROBID: https://github.com/kermitt2/grobid
- Crossref: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Transformers.js / WebGPU: https://huggingface.co/docs/transformers.js/guides/webgpu
- 公開npmパッケージ: https://www.npmjs.com/package/@huggingface/transformers
- WebLLM / JSON・キャッシュ・Worker: https://github.com/mlc-ai/web-llm
- WebLLM 登録モデル・VRAM目安: https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
- ONNX Runtime Web / 大規模モデルの制約: https://onnxruntime.ai/docs/tutorials/web/large-models.html
- Chrome Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- Chrome 内蔵AIの言語・端末要件: https://developer.chrome.com/docs/ai/get-started
- MediaPipe Web: https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js

モデルの重みはダウンロード・実行していない。実施したのは一次資料、モデルAPIのファイルサイズ、配布形式、公開JavaScriptランタイムの対応コードの確認である。ブラウザでのモデル精度・推論速度・実使用メモリは未測定。
