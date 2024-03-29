const User = require("../models").User;
const Likes = require("../models").Likes;
const Post = require("../models").Post;
const Chat = require("../models").Chat;
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");

exports.getSignin = (req, res) => {
    res.render("user/signin");
};

exports.postSignin = async (req, res) => {
    try {
        const { id, pw } = req.body;

        const userInfoInstance = await User.findOne({
            where: { id: id },
        });

        if (!userInfoInstance) {
            return res.send({ result: false, message: "존재하지 않는 아이디입니다." });
        }

        // userInfoInstance에서 dataValues 속성을 추출하여 순수한 JavaScript 객체로 변환
        const userInfo = userInfoInstance ? userInfoInstance.dataValues : null;

        if (id === userInfo.id && pw !== userInfo.pw) {
            return res.send({ result: false, message: "비밀번호가 일치하지 않습니다." });
        }

        if (id === userInfo.id && pw === userInfo.pw) {
            // access token 발급
            const accessToken = jwt.sign(
                {
                    u_seq: userInfo.u_seq,
                    id: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    nickname: userInfo.nickname,
                },
                process.env.ACCESS_SECRET,
                {
                    expiresIn: "24h",
                    issuer: "BBGG",
                }
            );
            // refresh token 발급
            const refreshToken = jwt.sign(
                {
                    u_seq: userInfo.u_seq,
                    id: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    nickname: userInfo.nickname,
                },
                process.env.REFRESH_SECRET,
                {
                    expiresIn: "24h",
                    issuer: "BBGG",
                }
            );
            res.send({
                result: true,
                accessToken: accessToken,
                refreshToken: refreshToken,
                nickname: userInfo.nickname,
            });
        } else {
            res.send({ result: false, message: "로그인 정보가 올바르지 않습니다." });
        }
    } catch (error) {
        res.status(500).send("server error");
    }
};

exports.postAccessToken = async (req, res) => {
    try {
        if (req.headers.authorization) {
            const accessToken = req.headers.authorization.split(" ")[1];

            try {
                // accessToken을 통해 검증된 회원 auth
                const auth = jwt.verify(accessToken, process.env.ACCESS_SECRET);

                const userInfoInstance = await User.findOne({
                    where: { id: auth.id },
                });

                // userInfoInstance에서 dataValues 속성을 추출하여 순수한 JavaScript 객체로 변환
                const userInfo = userInfoInstance ? userInfoInstance.dataValues : null;

                if (userInfo.id === auth.id) {
                    res.send({
                        result: true,
                        name: userInfo.name,
                        id: userInfo.id,
                        nickname: userInfo.nickname,
                        u_seq: userInfo.u_seq,
                        distance: userInfo.distance,
                    });
                }
                res.end();
            } catch (error) {
                res.send({ result: false, message: "인증된 회원이 아닙니다." });
            }
        } else {
            res.redirect("/users/signin");
        }
    } catch (error) {
        res.status(500).send("server error");
    }
};

// 유효성 검증
const { validationResult } = require("express-validator");
const { compareSync } = require("bcrypt");

exports.getSignup = (req, res) => {
    res.render("user/signup");
};

// 회원가입 중복 체크
exports.checkDuplicate = async (req, res) => {
    try {
        const { field, value } = req.body;

        const userInfoInstance = await User.findOne({
            where: { [field]: value },
        });

        if (userInfoInstance) {
            return res.send(false);
        }
        return res.send(true);
    } catch (err) {
        res.status(500).send("server error");
    }
};

// 회원가입
exports.postSignup = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.send({ errors: errors.array() });
    }

    await User.create({
        u_seq: null,
        id: req.body.userId,
        pw: req.body.userPw,
        email: req.body.email,
        name: req.body.name,
        nickname: req.body.nickname,
        distance: 0,
    }).then((result) => {
        res.end();
    });
};

// 프로필 페이지 요청
exports.getProfile = async (req, res) => {
    try {
        const id = req.params.id;
        const userInfo = await User.findOne({
            where: { id: id },
        });
        res.render("user/profileEdit", { data: userInfo });
    } catch (error) {
        res.status(500).send("server error");
    }
};

// 프로필 정보 수정
exports.patchProfile = async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                id: req.body.id,
            },
            attributes: ["u_seq", "nickname"],
        });

        const chatLists = await Chat.findAll({
            where: {
                [Op.or]: [{ u_seq: user.u_seq }, { b_seq: user.u_seq }],
            },
        });
        for (i = 0; i < chatLists.length; i++) {
            if (chatLists[i].c_title1 == user.nickname) {
                await Chat.update(
                    {
                        c_title1: req.body.nickname,
                    },
                    {
                        where: {
                            c_seq: chatLists[i].c_seq,
                        },
                    }
                );
            } else {
                await Chat.update(
                    {
                        c_title2: req.body.nickname,
                    },
                    {
                        where: {
                            c_seq: chatLists[i].c_seq,
                        },
                    }
                );
            }
        }

        await User.update(
            {
                nickname: req.body.nickname,
                pw: req.body.pw,
            },
            {
                where: {
                    id: req.body.id,
                },
            }
        );

        res.send(true);
    } catch (error) {
        res.status(500).send("server error");
    }
};

// 마이페이지 요청
exports.getMyPage = async (req, res) => {
    try {
        const id = req.params.id;

        const userInfo = await User.findOne({
            where: { id: id },
        });

        const myPosts = await Post.findAll({
            where: { u_seq: userInfo.u_seq },
            limit: 3,
            order: [["p_seq", "DESC"]],
        });

        let result = [];

        Likes.findAll({
            where: { u_seq: userInfo.u_seq },
            include: [
                {
                    model: Post,
                },
            ],
            order: [["l_seq", "DESC"]],
            limit: 3,
        }).then((likes) => {
            likes.forEach((like) => {
                result.push(like.Post);
            });
            res.render("user/profile", { data: userInfo, myPosts: myPosts, myLikes: result });
        });
    } catch (error) {
        res.status(500).send("server error");
    }
};

// 내가 쓴 글 페이지 요청
exports.getMyPost = async (req, res) => {
    try {
        const id = req.params.id;

        const user = await User.findOne({
            where: { id: id },
        });

        const posts = await Post.findAll({
            where: { u_seq: user.u_seq },
        });

        res.render("user/myPost", { data: posts, userInfo: user });
    } catch (error) {
        res.status(500).send("server error");
    }
};

// 관심 목록 요청
exports.getMyLike = async (req, res) => {
    try {
        const id = req.params.id;

        const user = await User.findOne({
            where: { id: id },
        });

        let result = [];
        Likes.findAll({
            where: { u_seq: user.u_seq },
            include: [
                {
                    model: Post,
                },
            ],
            order: [["l_seq", "DESC"]],
        }).then((likes) => {
            likes.forEach((like) => {
                result.push(like.Post);
            });
            res.render("user/myLike", { data: result, userInfo: user });
        });
    } catch (error) {
        res.status(500).send("server error");
    }
};
